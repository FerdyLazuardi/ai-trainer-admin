// src/scripts/kpi.ts
import { notify, openDetailModal, escapeHtml } from './utils';

export let rawKPIRows: any[] = [];
export let kpiPage = 1;

const ROLE_NAMES: Record<string, string> = {
  BP: 'Business Partner',
  BM: 'Business Manager',
  AM: 'Area Manager',
  RM: 'Regional Manager',
  HMB: 'Head of Micro Business',
  'Head HMB': 'Head of Micro Business',
  'HEAD HMB': 'Head of Micro Business',
  HO: 'Head Office',
  HQ: 'Headquarters',
};

const _kpiCache = new Map<string, { time: number; data: any }>();
const _historyCache = new Map<string, { time: number; data: any }>();

export async function loadKPIData(page = 1, force = false) {
  if (force) {
    _kpiCache.clear();
    _historyCache.clear();
  }
  kpiPage = page;
  const kpiTotalBadge = document.getElementById('kpi-total-badge');
  const kpiTableRows = document.getElementById('kpi-table-rows');
  const kpiSearchInput = document.getElementById('kpi-search-input') as HTMLInputElement | null;
  const kpiRoleFilter = document.getElementById('kpi-role-filter') as HTMLSelectElement | null;
  const kpiTargetRoles = document.getElementById('kpi-target-roles');
  const kpiTargetSubtitle = document.getElementById('kpi-target-subtitle');
  const btnKpiPrev = document.getElementById('btn-kpi-prev') as HTMLButtonElement | null;
  const kpiCurrentPage = document.getElementById('kpi-current-page');
  const kpiPageIndicator = document.getElementById('kpi-page-indicator');

  if (kpiCurrentPage) kpiCurrentPage.innerText = String(page);
  if (btnKpiPrev) btnKpiPrev.disabled = page <= 1;

  const q = (kpiSearchInput?.value || '').trim();
  const roleFilter = kpiRoleFilter ? kpiRoleFilter.value : 'ALL';

  let url = `/api/kpi?scope=users&page=${page}&limit=50`;
  if (q) url += `&search=${encodeURIComponent(q)}`;
  if (roleFilter !== 'ALL') url += `&role=${encodeURIComponent(roleFilter)}`;

  try {
    let data: any = null;
    const cached = _kpiCache.get(url);
    if (!force && cached && Date.now() - cached.time < 30_000) {
      data = cached.data;
    } else {
      if (kpiTableRows) {
        kpiTableRows.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400">Loading records from PostgreSQL...</td></tr>`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      _kpiCache.set(url, { time: Date.now(), data });
    }

    const users = data.users || (Array.isArray(data) ? data : []);
    rawKPIRows = users;

    const total = data.total ?? data.users_total ?? users.length;
    if (kpiTotalBadge) kpiTotalBadge.innerText = Number(total).toLocaleString('id-ID');
    if (kpiPageIndicator) {
      kpiPageIndicator.innerText = `Showing Page ${page} (${users.length} of ${Number(total).toLocaleString('id-ID')} records)`;
    }

    if (data.role_counts && Object.keys(data.role_counts).length > 0) {
      const roleEntries = Object.entries(data.role_counts).filter(([r]) => r && r !== 'UNKNOWN');
      
      if (roleEntries.length > 0 && kpiTargetRoles) {
        kpiTargetRoles.innerHTML = roleEntries.map(([r, c]) => `
          <button
            type="button"
            data-role-chip="${r}"
            class="role-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100/80 hover:bg-indigo-50 border border-gray-200/80 hover:border-indigo-300 text-xs font-bold text-gray-800 hover:text-indigo-700 transition-all cursor-pointer shadow-2xs group"
            title="Filter by ${r}"
          >
            <span class="text-indigo-600 font-extrabold group-hover:text-indigo-700">${r}</span>
            <span class="text-gray-500 font-semibold tabular-nums text-[11px] group-hover:text-indigo-600">(${Number(c).toLocaleString('id-ID')})</span>
          </button>
        `).join('');

        kpiTargetRoles.querySelectorAll('.role-chip').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const selectedRole = btn.getAttribute('data-role-chip');
            if (kpiRoleFilter && selectedRole) {
              kpiRoleFilter.value = selectedRole;
              loadKPIData(1);
            }
          });
        });
      }
      if (kpiTargetSubtitle) {
        kpiTargetSubtitle.innerText = `${roleEntries.length} Active Roles in Spreadsheet KPI • Click role to filter`;
      }

      if (kpiRoleFilter) {
        const currentSelected = kpiRoleFilter.value || 'ALL';
        const totalCountFormatted = Number(total).toLocaleString('id-ID');

        let optionsHtml = `<option value="ALL">All Roles (${totalCountFormatted})</option>`;
        roleEntries.forEach(([r, c]) => {
          const desc = ROLE_NAMES[r] ? ` (${ROLE_NAMES[r]})` : '';
          const countFormatted = Number(c).toLocaleString('id-ID');
          optionsHtml += `<option value="${r}">${r}${desc} - ${countFormatted}</option>`;
        });

        kpiRoleFilter.innerHTML = optionsHtml;
        if (roleEntries.some(([r]) => r === currentSelected)) {
          kpiRoleFilter.value = currentSelected;
        } else {
          kpiRoleFilter.value = 'ALL';
        }
      }
    } else if (users.length > 0 && kpiTargetRoles) {
      const uniqueRoles = [...new Set(users.map((u: any) => u.role || u.position).filter(Boolean))];
      if (uniqueRoles.length > 0) {
        kpiTargetRoles.innerHTML = uniqueRoles.map(r => `
          <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-gray-100 border border-gray-200 text-xs font-bold text-gray-800">
            <span class="text-indigo-600 font-extrabold">${r}</span>
          </span>
        `).join('');
      }
    }
    
    renderKPITable();

  } catch (err: any) {
    console.error('Failed to load KPI data:', err);
    if (kpiTableRows) {
      kpiTableRows.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-rose-600 font-mono">Error loading PostgreSQL KPI: ${err.message}</td></tr>`;
    }
  }
}

function renderKpiTrendSparkline(row: any): string {
  const directTrend = String(row.trend || row.kpi_trend || row.historical_trend || '').toLowerCase();
  let type: 'up' | 'stable' | 'down' = 'stable';

  if (directTrend) {
    if (directTrend.includes('up') || directTrend.includes('naik') || directTrend.includes('meningkat')) {
      type = 'up';
    } else if (directTrend.includes('down') || directTrend.includes('turun') || directTrend.includes('penurunan')) {
      type = 'down';
    } else {
      type = 'stable';
    }
  } else {
    const skorRaw = String(row['Skor KPI'] || row.skor_kpi || '0').replace('%', '').trim();
    const skor = parseFloat(skorRaw) || 0;
    const status = String(row['KPI Status'] || row.kpi_status || '').toLowerCase();
    const gapRaw = String(row['Gap Repayment Rate DPD 0'] || '').replace('%', '').trim();
    const gap = parseFloat(gapRaw) || 0;

    if (status.includes('exceed') || skor >= 80 || (skor >= 65 && gap >= 0)) {
      type = 'up';
    } else if (skor < 58 || (skor < 65 && gap < -3)) {
      type = 'down';
    } else {
      type = 'stable';
    }
  }

  if (type === 'up') {
    return `
      <div class="inline-flex items-center justify-center cursor-pointer" title="KPI Trend: Increase">
        <svg class="w-12 h-5 text-emerald-500 overflow-visible" viewBox="0 0 48 20" fill="none">
          <path d="M 3 17 C 15 14, 28 8, 45 4" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    `;
  } else if (type === 'down') {
    return `
      <div class="inline-flex items-center justify-center cursor-pointer" title="KPI Trend: Decrease">
        <svg class="w-12 h-5 text-rose-500 overflow-visible" viewBox="0 0 48 20" fill="none">
          <path d="M 3 13 C 12 10, 22 4, 30 8 C 36 12, 41 15, 45 17" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    `;
  } else {
    return `
      <div class="inline-flex items-center justify-center cursor-pointer" title="KPI Trend: Stable">
        <svg class="w-12 h-5 text-blue-500 overflow-visible" viewBox="0 0 48 20" fill="none">
          <path d="M 3 14 C 14 15, 22 7, 30 11 C 38 14, 41 10, 45 9" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    `;
  }
}

function buildSmoothSvgPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildEmployeeHistoryHtml(row: any, historyRecord?: any): string {
  if (historyRecord === undefined) {
    return `
      <div id="modal-historis-kpi-block" class="h-full flex flex-col justify-center items-center p-8 rounded-2xl bg-white border border-gray-200/90 shadow-2xs space-y-3 min-h-[360px]">
        <div class="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <div class="text-xs font-semibold text-gray-500 font-mono">Loading historical KPI from PostgreSQL...</div>
      </div>
    `;
  }

  const hData = historyRecord?.data || historyRecord || {};
  const hScores = hData.scores || {};
  const hQuarterly = hData.quarterly || {};

  const skorRaw = String(row['Skor KPI'] || row.skor_kpi || '0').replace('%', '').trim();
  const skorNum = parseFloat(skorRaw) || 0;

  // Competency & Certification (strictly from DB or '—')
  const competency = hData.competency || hData.COMPETENCY || row.competency || row.COMPETENCY || '—';
  const certResult = hData.certification_result || hData.CERTIFICATION_RESULT || row.certification_result || row.CERTIFICATION_RESULT || '—';

  // Months Jan - Dec
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthScores: (number | null)[] = [];

  months.forEach((m) => {
    const mUpper = m.toUpperCase();
    const mLower = m.toLowerCase();
    const rawVal = hScores[m] ?? hScores[mUpper] ?? hScores[mLower] ?? null;
    if (rawVal !== null && rawVal !== undefined) {
      const sVal = String(rawVal).trim();
      if (sVal !== '' && sVal !== '-' && sVal !== 'null' && sVal !== 'undefined') {
        const v = parseFloat(sVal.replace('%', ''));
        monthScores.push(isNaN(v) ? null : v);
        return;
      }
    }
    monthScores.push(null);
  });

  // Calculate or retrieve Avg Score (YTD) strictly from DB
  const rawAvg = hData.avg_score ?? hData.AVG_SCORE ?? row.avg_score ?? row.AVG_SCORE;
  let avgScoreFormatted = '—';
  if (rawAvg !== null && rawAvg !== undefined) {
    const sAvg = String(rawAvg).trim();
    if (sAvg !== '' && sAvg !== '-' && sAvg !== 'null') {
      avgScoreFormatted = sAvg.includes('%') ? sAvg : `${sAvg}%`;
    }
  }
  if (avgScoreFormatted === '—') {
    const validVals = monthScores.filter((v): v is number => v !== null);
    if (validVals.length > 0) {
      const avg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
      avgScoreFormatted = `${avg.toFixed(1)}%`;
    }
  }

  // Quarters
  const calcQ = (qKey: string, startIdx: number, endIdx: number) => {
    const qUpper = qKey.toUpperCase();
    const qLower = qKey.toLowerCase();
    const rawQ = hQuarterly[qKey] ?? hQuarterly[qUpper] ?? hQuarterly[qLower] ?? null;
    if (rawQ !== null && rawQ !== undefined) {
      const sQ = String(rawQ).trim();
      if (sQ !== '' && sQ !== '-' && sQ !== 'null' && sQ !== 'undefined') {
        return sQ.includes('%') ? sQ : `${sQ}%`;
      }
    }
    const vals = monthScores.slice(startIdx, endIdx).filter((v): v is number => v !== null);
    if (vals.length === 0) return '—';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${avg.toFixed(1)}%`;
  };

  const q1 = calcQ('Q1', 0, 3);
  const q2 = calcQ('Q2', 3, 6);
  const q3 = calcQ('Q3', 6, 9);
  const q4 = calcQ('Q4', 9, 12);

  // SVG Chart Geometry
  const chartW = 340;
  const chartH = 95;
  const padX = 10;
  const padY = 10;
  const bottomY = chartH - 4;

  const validVals = monthScores.filter((v): v is number => v !== null);
  const minV = validVals.length > 0 ? Math.max(0, Math.min(...validVals) - 4) : 0;
  const maxV = validVals.length > 0 ? Math.min(100, Math.max(...validVals) + 4) : 100;
  const vRange = (maxV - minV) || 1;

  // Active points across valid months (aligned to exact month slots: Jan=0, Dec=11)
  const totalSlots = 11;
  const points: { x: number; y: number; val: number; month: string }[] = [];
  monthScores.forEach((val, idx) => {
    if (val !== null) {
      const x = padX + (idx / totalSlots) * (chartW - padX * 2);
      const y = padY + (1 - (val - minV) / vRange) * (chartH - padY * 2);
      points.push({ x, y, val, month: months[idx] });
    }
  });

  const linePath = buildSmoothSvgPath(points);
  const firstPt = points[0] || { x: padX, y: chartH / 2 };
  const lastPt = points[points.length - 1] || { x: chartW - padX, y: chartH / 2 };
  const areaPath = points.length > 0
    ? `${linePath} L ${lastPt.x.toFixed(1)} ${bottomY} L ${firstPt.x.toFixed(1)} ${bottomY} Z`
    : '';

  // Colors & Indicator Text based on real recorded points
  let themeColor = '#3b82f6';
  let trendTextClass = 'text-blue-600';
  let trendIndicator = '→ 0.0% Stable';

  if (points.length > 1) {
    const diff = points[points.length - 1].val - points[0].val;
    const diffFormatted = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
    if (diff > 0.5) {
      themeColor = '#10b981';
      trendTextClass = 'text-emerald-600';
      trendIndicator = `↑ ${diffFormatted} Increase`;
    } else if (diff < -0.5) {
      themeColor = '#ef4444';
      trendTextClass = 'text-rose-600';
      trendIndicator = `↓ ${diffFormatted} Decrease`;
    } else {
      themeColor = '#3b82f6';
      trendTextClass = 'text-blue-600';
      trendIndicator = `→ ${diffFormatted} Stable`;
    }
  } else {
    const status = String(row['KPI Status'] || row.kpi_status || '').toLowerCase();
    if (status.includes('exceed') || skorNum >= 80) {
      themeColor = '#10b981';
      trendTextClass = 'text-emerald-600';
      trendIndicator = '↑ Increase';
    } else if (skorNum < 58) {
      themeColor = '#ef4444';
      trendTextClass = 'text-rose-600';
      trendIndicator = '↓ Decrease';
    }
  }

  const gradId = `grad-kpi-${Math.random().toString(36).substring(2, 8)}`;

  const dotsHtml = points.map((pt, i) => {
    const isLast = i === points.length - 1;
    return `
      <g class="cursor-pointer">
        <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${isLast ? 3.5 : 2.5}" fill="#ffffff" stroke="${themeColor}" stroke-width="${isLast ? 2.5 : 1.8}" />
        <title>${pt.month}: ${pt.val}%</title>
      </g>
    `;
  }).join('');

  return `
    <div id="modal-historis-kpi-block" class="h-full flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-white border border-gray-200/90 shadow-2xs space-y-4">
      <!-- Top Section: Score KPI & Trend (English, Margin Bottom) -->
      <div class="mb-1">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Score KPI</span>
        <div class="flex items-baseline gap-2.5 mt-0.5">
          <div class="text-3xl sm:text-4xl font-extrabold text-gray-900 font-mono tracking-tight">${skorNum.toFixed(1)}%</div>
          <div class="inline-flex items-center gap-1 text-xs font-bold ${trendTextClass}">
            ${trendIndicator}
          </div>
        </div>
      </div>

      <!-- Area Graphic Chart (Starts directly above January, full width) -->
      <div class="w-full relative">
        <div class="w-full h-28 sm:h-32">
          ${points.length > 0 ? `
            <svg viewBox="0 0 ${chartW} ${chartH}" class="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="${themeColor}" stop-opacity="0.25" />
                  <stop offset="90%" stop-color="${themeColor}" stop-opacity="0.02" />
                  <stop offset="100%" stop-color="${themeColor}" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path d="${areaPath}" fill="url(#${gradId})" />
              <path d="${linePath}" fill="none" stroke="${themeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              ${dotsHtml}
            </svg>
          ` : `
            <div class="w-full h-full flex items-center justify-center text-xs font-mono text-gray-400">
              No historical trend points recorded
            </div>
          `}
        </div>

        <!-- Month Labels below chart (aligned 1:1 directly under each data point) -->
        <div class="flex justify-between text-[10px] font-mono font-medium text-gray-400 px-2.5 pt-1.5 border-t border-gray-100 select-none">
          ${months.map((m, i) => {
            const hasVal = monthScores[i] !== null;
            return `<span class="${hasVal ? 'text-gray-600 font-semibold' : 'text-gray-300'}">${m}</span>`;
          }).join('')}
        </div>
      </div>

      <!-- Key Performance Metrics (Image 2 Footer Style, Clean Typography, NO CHIPS) -->
      <div class="grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
        <div>
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Competency</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 mt-1">${escapeHtml(competency)}</div>
        </div>
        <div>
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Certification</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 mt-1">${escapeHtml(certResult)}</div>
        </div>
        <div>
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Avg Score (YTD)</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 font-mono mt-1">${avgScoreFormatted}</div>
        </div>
      </div>

      <!-- Quarterly Breakdown (Clean Minimalist, NO CHIPS) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-gray-100">
        <div class="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
          <span class="text-[10px] font-bold text-gray-400 uppercase block">Quarter 1</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 font-mono mt-0.5">${q1}</div>
          <span class="text-[9px] text-gray-400">Jan - Mar</span>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
          <span class="text-[10px] font-bold text-gray-400 uppercase block">Quarter 2</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 font-mono mt-0.5">${q2}</div>
          <span class="text-[9px] text-gray-400">Apr - Jun</span>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
          <span class="text-[10px] font-bold text-gray-400 uppercase block">Quarter 3</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 font-mono mt-0.5">${q3}</div>
          <span class="text-[9px] text-gray-400">Jul - Sep</span>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
          <span class="text-[10px] font-bold text-gray-400 uppercase block">Quarter 4</span>
          <div class="text-xs sm:text-sm font-bold text-gray-900 font-mono mt-0.5">${q4}</div>
          <span class="text-[9px] text-gray-400">Oct - Dec</span>
        </div>
      </div>

      <!-- Monthly Breakdown Aligned with Quarters (English, Q1-Q4 without "Bulan") -->
      <div class="pt-3 border-t border-gray-100 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monthly Breakdown (2026)</span>
          <span class="text-[10px] font-mono text-gray-400">Jan – Dec</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <!-- Q1 Months -->
          <div class="p-2.5 rounded-xl bg-gray-50/70 border border-gray-100/80 space-y-1.5">
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-wider pb-1 border-b border-gray-200/50">Q1</div>
            ${[0, 1, 2].map(idx => {
              const val = monthScores[idx];
              const isNull = val === null;
              return `
                <div class="flex items-center justify-between text-xs py-0.5">
                  <span class="text-gray-500 font-medium text-[11px]">${months[idx]}</span>
                  <span class="font-mono font-bold ${isNull ? 'text-gray-300' : 'text-gray-800'} text-[11px]">${isNull ? '—' : `${val}%`}</span>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Q2 Months -->
          <div class="p-2.5 rounded-xl bg-gray-50/70 border border-gray-100/80 space-y-1.5">
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-wider pb-1 border-b border-gray-200/50">Q2</div>
            ${[3, 4, 5].map(idx => {
              const val = monthScores[idx];
              const isNull = val === null;
              return `
                <div class="flex items-center justify-between text-xs py-0.5">
                  <span class="text-gray-500 font-medium text-[11px]">${months[idx]}</span>
                  <span class="font-mono font-bold ${isNull ? 'text-gray-300' : 'text-gray-800'} text-[11px]">${isNull ? '—' : `${val}%`}</span>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Q3 Months -->
          <div class="p-2.5 rounded-xl bg-gray-50/70 border border-gray-100/80 space-y-1.5">
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-wider pb-1 border-b border-gray-200/50">Q3</div>
            ${[6, 7, 8].map(idx => {
              const val = monthScores[idx];
              const isNull = val === null;
              return `
                <div class="flex items-center justify-between text-xs py-0.5">
                  <span class="text-gray-500 font-medium text-[11px]">${months[idx]}</span>
                  <span class="font-mono font-bold ${isNull ? 'text-gray-300' : 'text-gray-800'} text-[11px]">${isNull ? '—' : `${val}%`}</span>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Q4 Months -->
          <div class="p-2.5 rounded-xl bg-gray-50/70 border border-gray-100/80 space-y-1.5">
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-wider pb-1 border-b border-gray-200/50">Q4</div>
            ${[9, 10, 11].map(idx => {
              const val = monthScores[idx];
              const isNull = val === null;
              return `
                <div class="flex items-center justify-between text-xs py-0.5">
                  <span class="text-gray-500 font-medium text-[11px]">${months[idx]}</span>
                  <span class="font-mono font-bold ${isNull ? 'text-gray-300' : 'text-gray-800'} text-[11px]">${isNull ? '—' : `${val}%`}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderKPITable() {
  const kpiTableRows = document.getElementById('kpi-table-rows');
  const kpiRoleFilter = document.getElementById('kpi-role-filter') as HTMLSelectElement | null;
  if (!kpiTableRows) return;

  const roleFilter = kpiRoleFilter ? kpiRoleFilter.value : 'ALL';
  const roleUpper = String(roleFilter || '').trim().toUpperCase();

  const filtered = rawKPIRows.filter(row => {
    if (roleUpper !== 'ALL') {
      const r = String(row.role || row.position || '').trim().toUpperCase();
      if (r !== roleUpper && !r.includes(roleUpper)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    kpiTableRows.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-gray-400">No matching employees found on this page.</td></tr>`;
    return;
  }

  kpiTableRows.innerHTML = filtered.map((row, idx) => {
    const skor = row['Skor KPI'] || row.skor_kpi || '—';
    const status = row['KPI Status'] || row.kpi_status || 'Need Improvement';
    const sLower = String(status).toLowerCase();

    let badgeClass = 'bg-amber-50 text-amber-700 border border-amber-200';
    let dotClass = 'bg-amber-500';
    let skorClass = 'text-gray-900';

    if (sLower.includes('exceed')) {
      badgeClass = 'bg-purple-50 text-purple-700 border border-purple-200 font-semibold';
      dotClass = 'bg-purple-500';
      skorClass = 'text-purple-600 font-bold';
    } else if (sLower.includes('achieve')) {
      badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold';
      dotClass = 'bg-emerald-500';
      skorClass = 'text-emerald-600 font-bold';
    }

    return `
      <tr data-kpi-index="${idx}" class="kpi-row hover:bg-gray-50/80 transition-colors cursor-pointer group">
        <td class="py-3 px-4 font-bold text-gray-900 font-mono group-hover:text-black transition-colors">${row.username || '—'}</td>
        <td class="py-3 px-4 text-gray-900 font-semibold">${row.full_name || '—'}</td>
        <td class="py-3 px-4">
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            ${row.role || row.position || 'BP'}
          </span>
        </td>
        <td class="py-3 px-4 text-gray-600">${row.point || '—'}</td>
        <td class="py-3 px-4 text-gray-500">${row.area || ''} / ${row.regional || ''}</td>
        <td class="py-3 px-4 font-bold tabular-nums ${skorClass}">${skor}</td>
        <td class="py-3 px-4 text-center">${renderKpiTrendSparkline(row)}</td>
        <td class="py-3 px-4 text-right">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
            ${status}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.kpi-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.getAttribute('data-kpi-index') || '0', 10);
      const row = filtered[idx];
      if (!row) return;

      const entries = Object.entries(row).filter(([k]) => k !== 'data');
      const highlights = [
        ['NIK / Username', row.username],
        ['Full Name', row.full_name],
        ['Position', `${row.role || ''} - ${row.position || ''}`],
        ['KPI Period', row.periode_kpi],
        ['Branch / Point', row.point],
        ['Area & Regional', `${row.area || ''} / ${row.regional || ''} (${row.pulau || ''})`],
        ['Ranking', row.Ranking || '—'],
        ['KPI Score', row['Skor KPI'] || '—'],
        ['KPI Status', row['KPI Status'] || '—'],
        ['Total Incentive', row['Total Insentif'] || '—'],
      ];

      const contentHtml = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <!-- Left Column (Desktop: 5 cols, Mobile: Top): Employee Highlights & Parameters -->
          <div class="lg:col-span-5 flex flex-col space-y-3">
            <div class="grid grid-cols-2 gap-2 shrink-0">
              ${highlights.map(([label, val]) => `
                <div class="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <span class="text-[10px] text-gray-400 font-bold uppercase block">${label}</span>
                  <div class="text-gray-900 font-bold text-xs truncate mt-0.5">${val || '—'}</div>
                </div>
              `).join('')}
            </div>

            <div class="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 flex-1 flex flex-col min-h-0">
              <div class="text-xs font-bold text-gray-800 uppercase text-[10px] tracking-wider shrink-0">All Parameters</div>
              <div class="flex-1 max-h-[250px] overflow-y-auto overflow-x-hidden space-y-1.5 pr-1 text-xs divide-y divide-gray-200/50 min-h-0">
                ${entries.map(([k, v]) => `
                  <div class="flex items-center justify-between py-1.5 gap-2 min-w-0">
                    <span class="text-gray-500 truncate text-[11px] min-w-0 flex-1">${k}</span>
                    <span class="text-gray-900 font-semibold tabular-nums font-mono text-[11px] shrink-0 truncate text-right max-w-[60%]">${String(v)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Right Column (Desktop: 7 cols, Mobile: Bottom): Historis KPI Graphic Chart & Stats -->
          <div class="lg:col-span-7 flex flex-col">
            ${buildEmployeeHistoryHtml(row)}
          </div>
        </div>
      `;
      openDetailModal(`Employee Record: ${row.full_name || row.username}`, `PostgreSQL user_kpi_data • ${row.role || 'Employee'}`, contentHtml);

      // Async fetch to enrich with live user_kpi_history if available
      if (row.username) {
        const hKey = String(row.username).trim();
        const cachedH = _historyCache.get(hKey);
        if (cachedH && Date.now() - cachedH.time < 60_000) {
          const records = cachedH.data?.records || [];
          const exact = records.find((r: any) => String(r.username).trim() === hKey) || records[0];
          const block = document.getElementById('modal-historis-kpi-block');
          if (block) block.outerHTML = buildEmployeeHistoryHtml(row, exact || { scores: {}, quarterly: {} });
        } else {
          fetch(`/api/history?search=${encodeURIComponent(row.username)}`)
            .then(res => res.json())
            .then(data => {
              _historyCache.set(hKey, { time: Date.now(), data });
              const block = document.getElementById('modal-historis-kpi-block');
              if (!block) return;
              const records = data?.records || [];
              const exact = records.find((r: any) => String(r.username).trim() === hKey) || records[0];
              block.outerHTML = buildEmployeeHistoryHtml(row, exact || { scores: {}, quarterly: {} });
            })
            .catch(() => {
              const block = document.getElementById('modal-historis-kpi-block');
              if (block) {
                block.outerHTML = buildEmployeeHistoryHtml(row, { scores: {}, quarterly: {} });
              }
            });
        }
      }
    });
  });
}

export function initKpiTab() {
  const kpiRoleFilter = document.getElementById('kpi-role-filter');
  const btnReloadKpi = document.getElementById('btn-reload-kpi');
  const kpiSearchInput = document.getElementById('kpi-search-input');
  const btnDeleteAllKpi = document.getElementById('btn-delete-all-kpi');
  const confirmDeleteModal = document.getElementById('confirm-delete-kpi-modal') as HTMLDialogElement | null;
  const btnCancelDeleteKpi = document.getElementById('btn-cancel-delete-kpi');
  const btnConfirmDeleteKpi = document.getElementById('btn-confirm-delete-kpi') as HTMLButtonElement | null;
  const confirmDeleteBtnText = document.getElementById('confirm-delete-btn-text');
  const btnKpiPrev = document.getElementById('btn-kpi-prev');
  const btnKpiNext = document.getElementById('btn-kpi-next');
  const statUserCount = document.getElementById('stat-user-count');
  const kpiTotalBadge = document.getElementById('kpi-total-badge');

  if (kpiRoleFilter) kpiRoleFilter.addEventListener('change', () => loadKPIData(1));
  if (btnReloadKpi) btnReloadKpi.addEventListener('click', () => loadKPIData(1, true));
  if (kpiSearchInput) {
    kpiSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadKPIData(1);
    });
  }

  if (btnDeleteAllKpi && confirmDeleteModal) {
    btnDeleteAllKpi.addEventListener('click', () => {
      confirmDeleteModal.showModal();
    });
  }

  if (btnCancelDeleteKpi && confirmDeleteModal) {
    btnCancelDeleteKpi.addEventListener('click', () => {
      confirmDeleteModal.close();
    });
    confirmDeleteModal.addEventListener('click', (e) => {
      if (e.target === confirmDeleteModal) confirmDeleteModal.close();
    });
  }

  if (btnConfirmDeleteKpi) {
    btnConfirmDeleteKpi.addEventListener('click', async () => {
      const origText = confirmDeleteBtnText ? confirmDeleteBtnText.innerText : 'Yes, Delete All Data';
      btnConfirmDeleteKpi.disabled = true;
      if (confirmDeleteBtnText) confirmDeleteBtnText.innerText = 'Truncating DB...';

      try {
        const res = await fetch('/api/kpi', { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || `HTTP ${res.status}`);
        }
        if (confirmDeleteModal) confirmDeleteModal.close();
        notify(result.message || 'PostgreSQL tables truncated successfully.');
        rawKPIRows = [];
        if (kpiTotalBadge) kpiTotalBadge.innerText = '0';
        if (statUserCount) statUserCount.innerText = '0';
        await loadKPIData(1);
      } catch (err: any) {
        notify(`Failed to truncate records: ${err.message}`, false);
      } finally {
        btnConfirmDeleteKpi.disabled = false;
        if (confirmDeleteBtnText) confirmDeleteBtnText.innerText = origText;
      }
    });
  }

  if (btnKpiPrev) {
    btnKpiPrev.addEventListener('click', () => {
      if (kpiPage > 1) loadKPIData(kpiPage - 1);
    });
  }

  if (btnKpiNext) {
    btnKpiNext.addEventListener('click', () => {
      loadKPIData(kpiPage + 1);
    });
  }
}
