// src/scripts/logs.ts
import { USD_TO_IDR, escapeHtml, formatTime, formatTimeNumeric, openDetailModal } from './utils';

export let rawChatLogs: any[] = [];
let rawUsersLTM: any[] = [];
let chatLogPage = 1;
const CHAT_LOG_PAGE_SIZE = 50;
let nextLogCursor: string | null = null;
let isLoadingMoreLogs = false;
let activeLogSubtab = 'recent';
export let lastKPIs: any = null;

const INTENT_CONFIG: Record<string, { hex: string; bg: string; text: string; border: string; label: string }> = {
  KNOWLEDGE: {
    hex: '#0066cc',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200/80',
    label: 'KNOWLEDGE'
  },
  COACHING: {
    hex: '#38bdf8',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200/80',
    label: 'COACHING'
  },
  GREETING: {
    hex: '#ef4444',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200/80',
    label: 'GREETING'
  },
  OFF_SCOPE: {
    hex: '#fb7185',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200/80',
    label: 'OFF_SCOPE'
  },
  TOPIC_LIST: {
    hex: '#0d9488',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200/80',
    label: 'TOPIC_LIST'
  },
  AMBIGUOUS: {
    hex: '#10b981',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200/80',
    label: 'AMBIGUOUS'
  },
  SECTION_DRILLDOWN: {
    hex: '#f59e0b',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200/80',
    label: 'SECTION_DRILLDOWN'
  },
};

export function getIntentBadge(intentName: string): string {
  const conf = INTENT_CONFIG[intentName] || {
    hex: '#64748b',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
    label: intentName || 'UNKNOWN'
  };
  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${conf.bg} ${conf.text} border ${conf.border}">
      <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${conf.hex}"></span>
      <span>${conf.label}</span>
    </span>
  `;
}

interface GeoInfo {
  point: string;
  area: string;
  regional: string;
  pulau: string;
}

const branchGeoMap = new Map<string, GeoInfo>();
let branchGeoPromise: Promise<void> | null = null;

function normGeoKey(s: string): string {
  return (s || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function extractGeoFromRow(obj: any): GeoInfo {
  const out: GeoInfo = { point: '', area: '', regional: '', pulau: '' };
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    const kl = k.toLowerCase().trim();
    const vs = String(v).trim();
    if (!vs) continue;
    if ((kl === 'point' || kl === 'cabang') && !out.point) out.point = vs;
    else if ((kl === 'area' || kl === 'wilayah') && !out.area) out.area = vs;
    else if ((kl === 'regional' || kl === 'region') && !out.regional) out.regional = vs;
    else if ((kl === 'pulau' || kl === 'island') && !out.pulau) out.pulau = vs;
  }
  if (!out.pulau && out.regional) {
    out.pulau = inferPulauFromRegional(out.regional);
  }
  return out;
}

export function inferPulauFromRegional(regional: string): string {
  const r = (regional || '').toLowerCase().trim();
  if (!r) return '';
  if (r.includes('jawa') || r.includes('java')) return 'Jawa';
  if (['sumatera', 'sumatra', 'sumbagsel', 'sumbagut', 'sumbagteng', 'aceh', 'lampung', 'riau', 'jambi', 'bengkulu'].some(k => r.includes(k))) return 'Sumatera';
  if (['sulawesi', 'sulsel', 'sulteng', 'sulut', 'sultra', 'gorontalo'].some(k => r.includes(k))) return 'Sulawesi';
  if (['kalimantan', 'borneo', 'kalbar', 'kalteng', 'kalsel', 'kaltim', 'kalut'].some(k => r.includes(k))) return 'Kalimantan';
  if (['bali', 'nusa', 'nusra', 'ntb', 'ntt', 'lombok'].some(k => r.includes(k))) return 'Bali & Nusa Tenggara';
  if (['maluku', 'papua'].some(k => r.includes(k))) return 'Maluku & Papua';
  return '';
}

async function ensureBranchGeoLoaded(): Promise<void> {
  if (branchGeoMap.size > 0) return;
  if (branchGeoPromise) return branchGeoPromise;
  branchGeoPromise = (async () => {
    try {
      for (let page = 1; page <= 6; page++) {
        const res = await fetch(`/api/kpi?scope=branches&page=${page}&limit=200`);
        if (!res.ok) break;
        const data = await res.json();
        const branches = data.branches || (Array.isArray(data) ? data : []);
        if (!Array.isArray(branches) || branches.length === 0) break;
        for (const b of branches) {
          const geo = extractGeoFromRow(b);
          const pt = String(b.point || b.nama_cabang || geo.point || '').trim();
          const key = normGeoKey(pt);
          if (key) {
            branchGeoMap.set(key, {
              point: pt || geo.point,
              area: geo.area,
              regional: geo.regional,
              pulau: geo.pulau,
            });
          }
        }
        if (branches.length < 200) break;
      }
    } catch (e) {
      console.warn('Branch geo fallback load skipped:', e);
    }
  })();
  return branchGeoPromise;
}

export function parseSessionUser(sessionId: string, row?: any) {
  let id = 'dev';
  let parsedName = '';
  let parsedRole = '';
  let parsedLocation = '';

  if (!sessionId || sessionId === 'Unknown' || sessionId === 'dev_user_123') {
    parsedName = 'Admin / Dev';
    parsedRole = 'HQ Operator';
  } else {
    const parts = sessionId.split('_');
    if (parts.length <= 1) {
      id = sessionId;
      parsedName = sessionId;
      parsedRole = 'Employee';
    } else {
      id = parts[0];
      const roleMarkers = ['fo', 'ho', 'admin', 'bm', 'bp', 'am', 'rm', 'hmb', 'area', 'manager', 'staff', 'lead', 'business', 'officer'];

      let markerIdx = -1;
      for (let i = 1; i < parts.length; i++) {
        if (roleMarkers.includes(parts[i].toLowerCase())) {
          markerIdx = i;
          break;
        }
      }

      let roleTokens: string[] = [];
      let locationTokens: string[] = [];

      if (markerIdx > 1) {
        parsedName = parts.slice(1, markerIdx).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        const remainder = parts.slice(markerIdx).filter(s => s.toLowerCase() !== 'n/a' && s.toLowerCase() !== 'na');

        const roleTerminalWords = ['manager', 'partner', 'officer', 'leader', 'staff', 'admin', 'coordinator', 'specialist', 'analyst', 'head', 'lead', 'trainee'];
        let terminalIdx = -1;
        for (let j = 0; j < remainder.length; j++) {
          if (roleTerminalWords.includes(remainder[j].toLowerCase())) {
            terminalIdx = j;
            break;
          }
        }

        if (terminalIdx !== -1) {
          roleTokens = remainder.slice(0, terminalIdx + 1);
          locationTokens = remainder.slice(terminalIdx + 1);
        } else {
          roleTokens = remainder.slice(0, 3);
          locationTokens = remainder.slice(3);
        }
      } else if (markerIdx === 1) {
        parsedName = parts.slice(1).filter(s => s.toLowerCase() !== 'na').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || `User #${id}`;
        roleTokens = ['Staff'];
      } else {
        parsedName = parts.slice(1).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        roleTokens = ['Employee'];
      }

      parsedRole = roleTokens.map(s => {
        const lower = s.toLowerCase();
        if (['fo', 'ho', 'bm', 'bp', 'am', 'rm', 'hmb'].includes(lower)) return lower.toUpperCase();
        return s.charAt(0).toUpperCase() + s.slice(1);
      }).join(' ');

      parsedLocation = locationTokens.map(s => s.toUpperCase()).join(' ');
    }
  }

  const finalPoint = String(row?.point || parsedLocation || '').trim();
  const branchGeo = finalPoint ? branchGeoMap.get(normGeoKey(finalPoint)) : undefined;

  const finalName = String(row?.full_name || parsedName || `User #${id}`).trim();
  const finalRole = String(row?.position || parsedRole || 'Field Staff').trim();
  const finalArea = String(row?.area || branchGeo?.area || '').trim();
  const finalRegional = String(row?.regional || branchGeo?.regional || '').trim();
  let finalPulau = String(row?.pulau || branchGeo?.pulau || '').trim();
  if (!finalPulau && finalRegional) {
    finalPulau = inferPulauFromRegional(finalRegional);
  }
  const finalUsername = String(row?.username || '').trim();

  return {
    name: finalName,
    role: finalRole,
    location: finalPoint || branchGeo?.point || '',
    point: finalPoint || branchGeo?.point || '',
    area: finalArea,
    regional: finalRegional,
    pulau: finalPulau,
    username: finalUsername,
    id: id,
    raw: sessionId || '—',
  };
}

function displayModel(val: any) {
  if (!val) return 'Mimo v2.5';
  const parts = String(val).split('/');
  return parts[parts.length - 1];
}

function renderIntentDonut(intents: any[], container: HTMLElement) {
  if (!intents || intents.length === 0) {
    container.innerHTML = `<div class="text-gray-400 py-6 text-center text-xs">No intent data recorded.</div>`;
    return;
  }

  const total = intents.reduce((acc, cur) => acc + (cur.count || 0), 0) || 1;
  const sorted = [...intents].sort((a, b) => (b.count || 0) - (a.count || 0));

  const cx = 100;
  const cy = 100;
  const rOut = 92;
  const rIn = 58;

  let startAngle = -Math.PI / 2;
  let paths = '';
  let labels = '';

  sorted.forEach(item => {
    const count = item.count || 0;
    const fraction = count / total;
    const angle = fraction * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const conf = INTENT_CONFIG[item.intent] || { hex: '#64748B' };
    const color = conf.hex;

    const x1 = cx + rOut * Math.cos(startAngle);
    const y1 = cy + rOut * Math.sin(startAngle);
    const x2 = cx + rOut * Math.cos(endAngle);
    const y2 = cy + rOut * Math.sin(endAngle);

    const x3 = cx + rIn * Math.cos(endAngle);
    const y3 = cy + rIn * Math.sin(endAngle);
    const x4 = cx + rIn * Math.cos(startAngle);
    const y4 = cy + rIn * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const d = `
      M ${x1.toFixed(2)} ${y1.toFixed(2)}
      A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
      L ${x3.toFixed(2)} ${y3.toFixed(2)}
      A ${rIn} ${rIn} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}
      Z
    `;

    paths += `<path d="${d}" fill="${color}" stroke="${color}" stroke-width="0.5" class="transition-opacity duration-200 hover:opacity-85 cursor-pointer"><title>${item.intent}: ${count} (${(fraction * 100).toFixed(1)}%)</title></path>`;

    if (fraction >= 0.15) {
      const midAngle = startAngle + angle / 2;
      const rLabel = (rOut + rIn) / 2;
      const lx = cx + rLabel * Math.cos(midAngle);
      const ly = cy + rLabel * Math.sin(midAngle);
      const pctStr = (fraction * 100).toFixed(1) + '%';
      labels += `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" class="text-[10px] font-extrabold font-mono pointer-events-none drop-shadow-xs select-none">${pctStr}</text>`;
    }

    startAngle = endAngle;
  });

  const legendHtml = sorted.map(item => {
    const count = item.count || 0;
    const pct = ((count / total) * 100).toFixed(1);
    const conf = INTENT_CONFIG[item.intent] || { hex: '#64748B' };
    return `
      <div class="flex items-center justify-between gap-3 text-xs py-1.5 px-2 rounded-xl hover:bg-gray-100 transition-colors">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-3 h-3 rounded-xs shrink-0 shadow-2xs" style="background-color: ${conf.hex}"></span>
          <span class="font-bold text-gray-900 text-xs truncate">${item.intent}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0 font-mono text-xs">
          <span class="font-extrabold text-gray-900 tabular-nums">${pct}%</span>
          <span class="text-gray-500 text-[11px] tabular-nums">(${count.toLocaleString('id-ID')})</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row items-center justify-center gap-6 md:gap-8 w-full py-2">
      <div class="relative shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 200 200" class="w-52 h-52 sm:w-56 sm:h-56 drop-shadow-xs">
          ${paths}
          <circle cx="100" cy="100" r="${rIn}" fill="#FFFFFF" />
          ${labels}
        </svg>
      </div>
      <div class="flex-1 w-full max-w-sm flex flex-col justify-center divide-y divide-gray-100">
        ${legendHtml}
      </div>
    </div>
  `;
}

export async function loadChatLogs() {
  const chatLogsRows = document.getElementById('chat-logs-rows');
  const logStatQueries = document.getElementById('log-stat-queries');
  const logStatLatency = document.getElementById('log-stat-latency');
  const logStatHitrate = document.getElementById('log-stat-hitrate');
  const logStatCost = document.getElementById('log-stat-cost');
  const logStatTokens = document.getElementById('log-stat-tokens');
  const intentDonutContainer = document.getElementById('intent-donut-container');
  const trendsChartContainer = document.getElementById('trends-chart-container');

  try {
    if (chatLogsRows) {
      chatLogsRows.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400">Loading chat logs from FastAPI backend...</td></tr>`;
    }
    const [res] = await Promise.all([
      fetch('/api/logs?limit=500'),
      ensureBranchGeoLoaded(),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const kpis = data.kpis || {};
    let logs = data.logs || [];
    const intents = data.intents || [];
    const trends = data.trends || [];
    const users = data.users || [];

    nextLogCursor = data.next_cursor || null;

    while (nextLogCursor) {
      try {
        const resNext = await fetch(`/api/logs?limit=500&cursor=${encodeURIComponent(nextLogCursor)}`);
        if (!resNext.ok) break;
        const dataNext = await resNext.json();
        if (dataNext.logs && dataNext.logs.length > 0) {
          logs = logs.concat(dataNext.logs);
        }
        nextLogCursor = dataNext.next_cursor || null;
        if (!dataNext.logs || dataNext.logs.length < 500) break;
      } catch (e) {
        console.warn('Background log fetch error:', e);
        break;
      }
    }

    rawChatLogs = logs;
    rawUsersLTM = users;
    chatLogPage = 1;
    lastKPIs = kpis;

    if (logStatQueries) logStatQueries.innerText = (kpis.total_queries ?? logs.length).toLocaleString('id-ID');
    const avgSec = ((kpis.avg_latency || 0) / 1000).toFixed(2);
    if (logStatLatency) logStatLatency.innerText = `${avgSec}s`;
    if (logStatHitrate) logStatHitrate.innerText = `${(kpis.hit_rate || 0).toFixed(1)}%`;
    const costIdr = Math.round((kpis.total_cost || 0) * USD_TO_IDR);
    if (logStatCost) logStatCost.innerText = `Rp ${costIdr.toLocaleString('id-ID')}`;
    if (logStatTokens) logStatTokens.innerText = `${((kpis.or_cached_tokens || 0) / 1_000_000).toFixed(1)}M cached tokens`;

    if (intentDonutContainer) renderIntentDonut(intents, intentDonutContainer);

    if (trendsChartContainer) {
      if (trends.length > 0) {
        const maxQ = Math.max(...trends.map((t: any) => t.queries || 1));
        trendsChartContainer.innerHTML = trends.map((t: any) => {
          const hPct = Math.max(8, Math.round(((t.queries || 0) / maxQ) * 100));
          const shortDate = t.date ? t.date.slice(5) : '';
          return `
            <div class="min-w-[14px] sm:min-w-[18px] flex-1 flex flex-col items-center gap-1 group h-full justify-end shrink-0 sm:shrink">
              <span class="text-[9px] font-mono text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">${t.queries}</span>
              <div class="w-full max-w-[20px] bg-gray-900 hover:bg-black rounded-t transition-all" style="height: ${hPct}%"></div>
              <span class="text-[9px] font-mono text-gray-400 truncate w-full text-center">${shortDate}</span>
            </div>
          `;
        }).join('');
      } else {
        trendsChartContainer.innerHTML = `<div class="w-full text-gray-400 text-xs text-center">No trend data available.</div>`;
      }
    }

    renderChatLogsTable();
    renderLTMTable();

    if (activeLogSubtab === 'explorer') {
      renderSessionExplorer();
    } else if (activeLogSubtab === 'classification') {
      renderClassificationView();
    }
    populateClassificationFilters();

  } catch (err: any) {
    console.error('Failed to load chat logs:', err);
    if (chatLogsRows) {
      chatLogsRows.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-rose-600 font-mono">Error loading logs: ${err.message}</td></tr>`;
    }
  }
}

function getFilteredLogs(): any[] {
  const logSearchInput = document.getElementById('log-search-input') as HTMLInputElement | null;
  const logIntentFilter = document.getElementById('log-intent-filter') as HTMLSelectElement | null;
  const q = (logSearchInput?.value || '').toLowerCase().trim();
  const intentFilter = logIntentFilter?.value || 'ALL';

  return rawChatLogs.filter(row => {
    if (intentFilter !== 'ALL' && row.intent !== intentFilter) return false;
    if (q) {
      const user = parseSessionUser(row.session_id, row);
      const hay = [
        row.query || '',
        row.session_id || '',
        row.answer || '',
        user.name,
        user.role,
        user.point,
        user.area,
        user.regional,
        user.pulau,
        user.username,
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function renderChatLogsTable() {
  const chatLogsRows = document.getElementById('chat-logs-rows');
  const logPageIndicator = document.getElementById('log-page-indicator');
  const logCurrentPage = document.getElementById('log-current-page');
  const btnLogPrev = document.getElementById('btn-log-prev') as HTMLButtonElement | null;
  const btnLogNext = document.getElementById('btn-log-next') as HTMLButtonElement | null;

  if (!chatLogsRows) return;

  const filtered = getFilteredLogs();

  const totalRecords = filtered.length;
  if (totalRecords === 0) {
    chatLogsRows.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-gray-400">No matching log records found.</td></tr>`;
    if (logPageIndicator) logPageIndicator.innerText = 'Showing 0 records';
    if (logCurrentPage) logCurrentPage.innerText = '1';
    if (btnLogPrev) btnLogPrev.disabled = true;
    if (btnLogNext) btnLogNext.disabled = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / CHAT_LOG_PAGE_SIZE));
  if (chatLogPage > totalPages) chatLogPage = totalPages;
  if (chatLogPage < 1) chatLogPage = 1;

  const startIdx = (chatLogPage - 1) * CHAT_LOG_PAGE_SIZE;
  const endIdx = Math.min(startIdx + CHAT_LOG_PAGE_SIZE, totalRecords);
  const pageRows = filtered.slice(startIdx, endIdx);

  if (logCurrentPage) logCurrentPage.innerText = String(chatLogPage);
  if (btnLogPrev) btnLogPrev.disabled = (chatLogPage <= 1);
  if (btnLogNext) btnLogNext.disabled = (chatLogPage >= totalPages && !nextLogCursor);
  if (logPageIndicator) {
    logPageIndicator.innerText = `Showing Page ${chatLogPage} of ${totalPages} (${startIdx + 1}–${endIdx} of ${totalRecords.toLocaleString('id-ID')} records)`;
  }

  chatLogsRows.innerHTML = pageRows.map((row, relativeIdx) => {
    const globalIdx = startIdx + relativeIdx;
    const user = parseSessionUser(row.session_id, row);
    const costIdr = Math.round((row.cost || 0) * USD_TO_IDR);
    const latSec = ((row.latency_ms || 0) / 1000).toFixed(2);
    const geoParts = [user.point, user.area, user.regional].filter(Boolean);
    const geoSummary = geoParts.join(' • ');

    return `
      <tr data-log-index="${globalIdx}" class="chat-log-row hover:bg-gray-50/80 transition-colors cursor-pointer group">
        <td class="py-3 px-4 font-mono text-gray-500 tabular-nums whitespace-nowrap text-xs">
          ${formatTimeNumeric(row.created_at)}
        </td>
        <td class="py-3 px-4">
          <div class="font-bold text-gray-900 truncate max-w-[190px]" title="${escapeHtml(row.session_id || '')}">${escapeHtml(user.name)}</div>
          <div class="mt-0.5 flex flex-wrap items-center gap-1">
            <span class="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium text-[10px] whitespace-nowrap truncate max-w-[180px]">
              ${escapeHtml(user.role)}
            </span>
          </div>
          ${geoSummary ? `<div class="mt-1 text-[10px] text-gray-500 truncate max-w-[190px]" title="${escapeHtml([user.point, user.area, user.regional, user.pulau].filter(Boolean).join(' • '))}">${escapeHtml(geoSummary)}</div>` : ''}
        </td>
        <td class="py-3 px-4 max-w-xs sm:max-w-md md:max-w-lg min-w-0">
          <div class="font-semibold text-gray-900 text-xs truncate" title="${escapeHtml(row.query || '—')}">${escapeHtml(row.query || '—')}</div>
          <div class="text-[11px] text-gray-500 mt-0.5 truncate font-sans" title="${escapeHtml(row.answer || '')}">
            ${escapeHtml(row.answer || '—')}
          </div>
        </td>
        <td class="py-3 px-4">
          ${getIntentBadge(row.intent)}
        </td>
        <td class="py-3 px-4">
          <div class="font-mono text-gray-900 font-semibold text-xs tabular-nums">${latSec}s</div>
          <span class="text-[10px] ${row.cache_hit || (row.or_cached_tokens > 0) ? 'text-emerald-600 font-semibold' : 'text-gray-400'}">
            ${row.cache_hit || (row.or_cached_tokens > 0) ? 'Cached' : 'Network'}
          </span>
        </td>
        <td class="py-3 px-4 text-gray-600 font-mono tabular-nums text-xs">${(row.tokens || 0).toLocaleString('id-ID')}</td>
        <td class="py-3 px-4 text-right text-gray-900 font-bold tabular-nums">Rp ${costIdr.toLocaleString('id-ID')}</td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.chat-log-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.getAttribute('data-log-index') || '0', 10);
      const row = filtered[idx];
      if (!row) return;

      const user = parseSessionUser(row.session_id, row);
      const contentHtml = `
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            ${getIntentBadge(row.intent)}
            <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">Model: ${displayModel(row.or_provider)}</span>
            <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">Latency: ${((row.latency_ms || 0)/1000).toFixed(2)}s</span>
            <span class="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">Tokens: ${(row.tokens || 0).toLocaleString('id-ID')}</span>
            <span class="px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">Cost: Rp ${Math.round((row.cost || 0) * USD_TO_IDR).toLocaleString('id-ID')}</span>
          </div>

          <div class="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2.5 text-xs font-sans">
            <div class="flex items-center justify-between pb-1.5 border-b border-gray-200/60">
              <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">User Identity & Session</span>
              <div class="flex items-center gap-1.5">
                ${user.username ? `<span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/70 font-mono text-[10px] font-bold">NIK: ${escapeHtml(user.username)}</span>` : ''}
                <span class="px-2 py-0.5 rounded-md bg-gray-200 text-gray-800 font-mono text-[10px] font-bold">User ID: ${escapeHtml(user.id)}</span>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700">
              <div><span class="text-gray-400">Full Name:</span> <strong class="text-gray-900 ml-1">${escapeHtml(user.name)}</strong></div>
              <div><span class="text-gray-400">Position:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.role)}</span></div>
              <div><span class="text-gray-400">Branch Point:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.point || '—')}</span></div>
              <div><span class="text-gray-400">Area:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.area || '—')}</span></div>
              <div><span class="text-gray-400">Regional:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.regional || '—')}</span></div>
              <div><span class="text-gray-400">Pulau:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.pulau || '—')}</span></div>
            </div>
            <div class="pt-1.5 border-t border-gray-200/60">
              <div class="text-[10px] text-gray-400 font-mono mb-1 uppercase tracking-wider">Full Session ID:</div>
              <div class="font-mono text-[11px] text-gray-800 bg-white p-2.5 rounded-xl border border-gray-200/80 break-all select-all shadow-2xs">
                ${escapeHtml(user.raw)}
              </div>
            </div>
          </div>

          <div class="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
            <div class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">User Query</div>
            <div class="text-gray-900 text-sm whitespace-pre-wrap font-medium">${escapeHtml(row.query || '—')}</div>
          </div>

          <div class="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
            <div class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Assistant Response</div>
            <div class="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">${escapeHtml(row.answer || '—')}</div>
          </div>
        </div>
      `;
      openDetailModal(`${user.name} (${user.role})`, `Recorded at ${formatTime(row.created_at)}`, contentHtml);
    });
  });
}

function getGroupedSessions() {
  const groups = new Map();
  rawChatLogs.forEach(log => {
    const sId = log.session_id || 'Unknown';
    if (!groups.has(sId)) {
      groups.set(sId, []);
    }
    groups.get(sId).push(log);
  });

  const sessionList: any[] = [];
  groups.forEach((turns, sId) => {
    turns.sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    const latestTurn = turns[turns.length - 1];
    const user = parseSessionUser(sId, latestTurn);
    sessionList.push({
      sessionId: sId,
      user,
      turns,
      turnsCount: turns.length,
      latestActivity: latestTurn?.created_at || ''
    });
  });

  sessionList.sort((a, b) => new Date(b.latestActivity || 0).getTime() - new Date(a.latestActivity || 0).getTime());
  return sessionList;
}

export function renderSessionExplorer() {
  const sessionSummaryRows = document.getElementById('session-summary-rows');
  const explorerSearchInput = document.getElementById('explorer-search-input') as HTMLInputElement | null;
  if (!sessionSummaryRows) return;

  const q = (explorerSearchInput?.value || '').toLowerCase().trim();
  const sessions = getGroupedSessions();

  const filtered = sessions.filter(s => {
    if (!q) return true;
    const hay = [
      s.sessionId,
      s.user.name,
      s.user.role,
      s.user.point,
      s.user.area,
      s.user.regional,
      s.user.pulau,
      s.user.username,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    sessionSummaryRows.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">No matching sessions found.</td></tr>`;
    return;
  }

  sessionSummaryRows.innerHTML = filtered.map((s, idx) => {
    const geoParts = [s.user.point, s.user.area, s.user.regional, s.user.pulau].filter(Boolean);
    const geoText = geoParts.join(' • ');
    return `
    <tr data-session-idx="${idx}" class="session-summary-row hover:bg-gray-50/80 transition-colors cursor-pointer group">
      <td class="py-3 px-4">
        <div class="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">${escapeHtml(s.user.name)}</div>
        <div class="mt-0.5 flex flex-wrap items-center gap-1">
          <span class="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium text-[10px]">
            ${escapeHtml(s.user.role)}
          </span>
        </div>
        ${geoText ? `<div class="mt-1 text-[10px] text-gray-500">${escapeHtml(geoText)}</div>` : ''}
      </td>
      <td class="py-3 px-4 font-mono text-gray-500 text-xs truncate max-w-[220px]" title="${escapeHtml(s.sessionId)}">
        ${escapeHtml(s.sessionId)}
      </td>
      <td class="py-3 px-4">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
          ${s.turnsCount} turns
        </span>
      </td>
      <td class="py-3 px-4 font-mono text-gray-500 tabular-nums text-xs whitespace-nowrap">
        ${formatTimeNumeric(s.latestActivity)}
      </td>
      <td class="py-3 px-4 text-right">
        <button class="btn-open-session px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-xs font-semibold text-gray-700 shadow-2xs cursor-pointer group-hover:border-gray-300">
          View Chat ›
        </button>
      </td>
    </tr>
  `}).join('');

  document.querySelectorAll('.session-summary-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.getAttribute('data-session-idx') || '0', 10);
      const selected = filtered[idx];
      if (selected) openSessionThread(selected);
    });
  });
}

function openSessionThread(sessionGroup: any) {
  const threadModal = document.getElementById('thread-modal') as HTMLDialogElement | null;
  const threadSessionTitle = document.getElementById('thread-session-title');
  const threadSessionSubtitle = document.getElementById('thread-session-subtitle');
  const threadMessagesList = document.getElementById('thread-messages-list');

  if (!sessionGroup || !threadModal || !threadSessionTitle || !threadSessionSubtitle || !threadMessagesList) return;

  const u = sessionGroup.user;
  const geoLine = [
    u.point ? `Point: ${u.point}` : '',
    u.area ? `Area: ${u.area}` : '',
    u.regional ? `Regional: ${u.regional}` : '',
    u.pulau ? `Pulau: ${u.pulau}` : '',
  ].filter(Boolean).join(' • ');

  threadSessionTitle.innerText = `${u.name} (${u.role})`;
  threadSessionSubtitle.innerText = [
    geoLine,
    `Session ID: ${sessionGroup.sessionId}`,
    `${sessionGroup.turnsCount} turns`,
    `Latest: ${formatTimeNumeric(sessionGroup.latestActivity)}`,
  ].filter(Boolean).join(' • ');

  threadMessagesList.innerHTML = sessionGroup.turns.map((turn: any, idx: number) => `
    <div class="space-y-3 pb-4 border-b border-gray-200/50 last:border-0">
      <div class="flex items-center justify-between text-[11px] text-gray-400 font-mono">
        <span>Turn #${idx + 1}</span>
        <span>${formatTimeNumeric(turn.created_at)}</span>
      </div>

      <div class="flex justify-end">
        <div class="max-w-[85%] rounded-2xl rounded-tr-xs bg-gray-900 text-white p-3.5 shadow-2xs">
          <div class="text-[10px] uppercase font-bold text-gray-400 mb-1">${escapeHtml(sessionGroup.user.name)}</div>
          <div class="text-xs font-medium whitespace-pre-wrap leading-relaxed">${escapeHtml(turn.query || '—')}</div>
        </div>
      </div>

      <div class="flex justify-start">
        <div class="max-w-[85%] rounded-2xl rounded-tl-xs bg-white border border-gray-200 p-3.5 space-y-2 shadow-2xs">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] uppercase font-bold text-gray-500">AI Assistant</span>
            ${getIntentBadge(turn.intent)}
          </div>
          <div class="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">${escapeHtml(turn.answer || '—')}</div>
          <div class="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-gray-400 font-mono border-t border-gray-100">
            <span>⏱️ ${((turn.latency_ms || 0)/1000).toFixed(2)}s</span>
            <span>🪙 ${(turn.tokens || 0).toLocaleString('id-ID')} tokens</span>
            <span>💵 Rp ${Math.round((turn.cost || 0) * USD_TO_IDR).toLocaleString('id-ID')}</span>
            ${turn.cache_hit || (turn.or_cached_tokens > 0) ? '<span class="text-emerald-600 font-semibold">Cached</span>' : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  threadModal.showModal();
}

export function renderLTMTable() {
  const ltmRows = document.getElementById('ltm-rows');
  const ltmSearchInput = document.getElementById('ltm-search-input') as HTMLInputElement | null;
  if (!ltmRows) return;

  const q = (ltmSearchInput?.value || '').toLowerCase().trim();

  const filtered = rawUsersLTM.filter(u => {
    if (!q) return true;
    const matchId = String(u.user_id || '').toLowerCase().includes(q);
    const matchSummary = String(u.learning_summary || '').toLowerCase().includes(q);
    return matchId || matchSummary;
  });

  if (filtered.length === 0) {
    ltmRows.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-gray-400">No matching user LTM records.</td></tr>`;
    return;
  }

  ltmRows.innerHTML = filtered.map(u => `
    <tr class="hover:bg-gray-50/80 transition-colors">
      <td class="py-3 px-4 font-mono font-bold text-gray-900">${escapeHtml(u.user_id || '—')}</td>
      <td class="py-3 px-4 text-gray-700 whitespace-pre-line text-xs leading-relaxed">${escapeHtml(u.learning_summary || '—')}</td>
      <td class="py-3 px-4 text-right font-mono text-gray-400 tabular-nums text-xs whitespace-nowrap">${formatTimeNumeric(u.updated_at)}</td>
    </tr>
  `).join('');
}

function exportFilteredLogsToCsv() {
  const rows = getFilteredLogs();
  const csvEsc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = [
    'Timestamp',
    'User ID',
    'NIK / Username',
    'Full Name',
    'Position',
    'Branch Point',
    'Area',
    'Regional',
    'Pulau',
    'Intent',
    'User Query',
    'Assistant Response',
    'Latency (s)',
    'Tokens',
    'Cost (IDR)',
    'Session ID',
  ];
  const lines = [headers.map(csvEsc).join(',')];
  for (const row of rows) {
    const user = parseSessionUser(row.session_id, row);
    const costIdr = Math.round((row.cost || 0) * USD_TO_IDR);
    const latSec = ((row.latency_ms || 0) / 1000).toFixed(2);
    lines.push([
      row.created_at || '',
      user.id,
      user.username,
      user.name,
      user.role,
      user.point,
      user.area,
      user.regional,
      user.pulau,
      row.intent || '',
      row.query || '',
      row.answer || '',
      latSec,
      row.tokens_raw ?? row.tokens ?? 0,
      costIdr,
      row.session_id || '',
    ].map(csvEsc).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ava_chat_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// 4. CLASSIFICATION & REGIONAL ANALYTICS
// ==========================================

export const CONSOLIDATED_DOMAINS = [
  "KPI, Target & Remunerasi (Insentif / Bonus)",
  "Portofolio, Penagihan (Collection) & Recovery Cabang",
  "Produk Pembiayaan, Proses Bisnis & Akuisisi Lapangan",
  "Kepemimpinan Cabang & Manajemen Tim (Leadership BM & AM)",
  "Sistem, Aplikasi Lapangan & Helpdesk (PST / Amartha Care)",
  "LMS, Pelatihan & Materi Pembelajaran",
  "HR, Karir, Benefit & Regulasi Kepegawaian",
  "Kepatuhan, Mitigasi Fraud & Perlindungan Nasabah (Client Protection)",
  "Simulasi Interaktif & Roleplay Lapangan (Sales & Penagihan)",
  "Budaya Perusahaan, Profil Organisasi & Personel Lapangan",
  "Interaksi Percakapan, Sapaan & Obrolan Santai (Off-Scope)",
];

const DOMAIN_SUBTOPICS_HINT: Record<string, string> = {
  "KPI, Target & Remunerasi (Insentif / Bonus)": "Pengecekan Skor, Syarat & Jadwal Pencairan Insentif, Parameter Bobot, Metrik Loan Paid & Dashboard Ranking",
  "Portofolio, Penagihan (Collection) & Recovery Cabang": "Penurunan PAR/NPL, Teknik Negosiasi Mitra Mangkir/Kabur, Flow Rate, DPD, WOB, RR & Sistem Tanggung Renteng",
  "Produk Pembiayaan, Proses Bisnis & Akuisisi Lapangan": "Modal Usaha vs GL, Prosedur UK/KL, NTB, ETB/Renewal, Pelunasan Dini (Peldin), AmarthaFin & Pelayanan Majelis",
  "Kepemimpinan Cabang & Manajemen Tim (Leadership BM & AM)": "Briefing Pagi, Penanganan BP Mangkir, Kepemimpinan Situasional, Pemetaan R1-R4 & Revamping Wilayah",
  "Sistem, Aplikasi Lapangan & Helpdesk (PST / Amartha Care)": "Alur Eskalasi Insiden PST, Troubleshooting Aplikasi BP, Input VA/Setoran & Berkas Onboarding Cabang",
  "LMS, Pelatihan & Materi Pembelajaran": "Presensi Kehadiran Pelatihan, Kuis/Post-Test, Akses Modul Amarthapedia & Troubleshooting Video Materi",
  "HR, Karir, Benefit & Regulasi Kepegawaian": "Kompensasi, Reimburse Bensin/Tol, Benefit Melahirkan, Lembur Sabtu, Hak Cuti & Promosi Assesment BM/AM",
  "Kepatuhan, Mitigasi Fraud & Perlindungan Nasabah (Client Protection)": "Mitigasi Fraud Lapangan, Fraud Joki, Pelaporan Fraud, Perlindungan Nasabah & Kode Etik",
  "Simulasi Interaktif & Roleplay Lapangan (Sales & Penagihan)": "Roleplay Pitching Sales Mitra, Penanganan Keberatan Pinjaman & Latihan Negosiasi Penagihan",
  "Budaya Perusahaan, Profil Organisasi & Personel Lapangan": "Internalisasi Nilai Budaya, Yel-Yel Amartha, Profil Pendiri, CEO & Struktur Organisasi",
  "Interaksi Percakapan, Sapaan & Obrolan Santai (Off-Scope)": "Sapaan (Greeting), Tanggapan Singkat Pengguna, Konfirmasi & Obrolan Santai di Luar Konteks",
};

let classFilterPulau = 'ALL';
let classFilterRegional = 'ALL';
let classFilterArea = 'ALL';
let classFilterPoint = 'ALL';
let classFilterPosition = 'ALL';
let classFilterAccountType = 'REAL'; // 'REAL' (User ID > 20) | 'ALL' | 'TESTING' (User ID <= 20)
let classFilterSearch = '';

export function isRealUserLog(row: any): boolean {
  const sid = String(row?.session_id || '').trim();
  if (!sid || sid === 'Unknown' || sid === 'dev_user_123') return false;
  const rawId = sid.split('_')[0];
  const n = parseInt(rawId, 10);
  return !isNaN(n) && n > 20;
}

function getLogTopicCategory(row: any): string {
  if (row.topic_category && row.topic_category !== 'UNKNOWN' && CONSOLIDATED_DOMAINS.includes(row.topic_category)) {
    return row.topic_category;
  }
  const q = String(row.query || '').toLowerCase().trim();
  if (!q) return "Interaksi Percakapan, Sapaan & Obrolan Santai (Off-Scope)";
  
  if (["kpi", "insentif", "bonus", "skor", "target", "disburse", "loan paid", "ranking", "rangking", "superset", "drawdown", "kintamani"].some(k => q.includes(k))) {
    return "KPI, Target & Remunerasi (Insentif / Bonus)";
  }
  if (["par", "npl", "dpd", "wob", "rr", "flow rate", "tagih", "nagih", "mangkir", "kabur", "jb", "ptp", "btc", "tanggung renteng", "recovery"].some(k => q.includes(k))) {
    return "Portofolio, Penagihan (Collection) & Recovery Cabang";
  }
  if (["gl", "modal", "pembiayaan", "uk", "kl", "ntb", "etb", "ranwel", "renewal", "peldin", "poket", "celengan", "afin", "amarthafin", "sosialisasi", "topsheet", "kumpulan"].some(k => q.includes(k))) {
    return "Produk Pembiayaan, Proses Bisnis & Akuisisi Lapangan";
  }
  if (["briefing", "morning", "r1-r4", "1-on-1", "leadership", "kepemimpinan", "split", "revamping", "petakan", "wilayah", "bp senior", "tim"].some(k => q.includes(k))) {
    return "Kepemimpinan Cabang & Manajemen Tim (Leadership BM & AM)";
  }
  if (["pst", "care", "aplikasi", "va", "save va", "50/50", "upload", "onboarding", "incident"].some(k => q.includes(k))) {
    return "Sistem, Aplikasi Lapangan & Helpdesk (PST / Amartha Care)";
  }
  if (["absen", "hadir", "presensi", "post test", "pre test", "kuis", "sertifikat", "video", "vd", "materi", "amarthapedia"].some(k => q.includes(k))) {
    return "LMS, Pelatihan & Materi Pembelajaran";
  }
  if (["gaji", "payroll", "benefit", "reimburse", "lembur", "sabtu", "cuti", "karir", "assesment", "bmdp", "promosi"].some(k => q.includes(k))) {
    return "HR, Karir, Benefit & Regulasi Kepegawaian";
  }
  if (["fraud", "joki", "atas nama", "etik", "pelecehan", "client protection"].some(k => q.includes(k))) {
    return "Kepatuhan, Mitigasi Fraud & Perlindungan Nasabah (Client Protection)";
  }
  if (["latihan sales", "berperan", "roleplay", "simulasi", "bu siti"].some(k => q.includes(k))) {
    return "Simulasi Interaktif & Roleplay Lapangan (Sales & Penagihan)";
  }
  if (["yel yel", "budaya", "culture", "ceo", "pendiri", "kapan amartha"].some(k => q.includes(k))) {
    return "Budaya Perusahaan, Profil Organisasi & Personel Lapangan";
  }
  if (["halo", "hallo", "pagi", "sore", "malam", "hi", "ok", "oke", "siap", "makasih", "thanks", "ganteng", "lapar", "ngantuk", "pacar", "iya"].some(k => q.includes(k))) {
    return "Interaksi Percakapan, Sapaan & Obrolan Santai (Off-Scope)";
  }
  return "Produk Pembiayaan, Proses Bisnis & Akuisisi Lapangan";
}

function getFilteredClassificationLogs(): any[] {
  const qSearch = classFilterSearch.toLowerCase().trim();
  return rawChatLogs.filter(row => {
    if (classFilterAccountType === 'REAL' && !isRealUserLog(row)) return false;
    if (classFilterAccountType === 'TESTING' && isRealUserLog(row)) return false;

    const user = parseSessionUser(row.session_id, row);
    if (classFilterPulau !== 'ALL' && (user.pulau || 'Lainnya') !== classFilterPulau) return false;
    if (classFilterRegional !== 'ALL' && (user.regional || 'Lainnya') !== classFilterRegional) return false;
    if (classFilterArea !== 'ALL' && (user.area || 'Lainnya') !== classFilterArea) return false;
    if (classFilterPoint !== 'ALL' && (user.point || 'Lainnya') !== classFilterPoint) return false;
    if (classFilterPosition !== 'ALL' && (user.role || 'Lainnya') !== classFilterPosition) return false;
    if (qSearch) {
      const matchQuery = String(row.query || '').toLowerCase().includes(qSearch);
      const matchCat = getLogTopicCategory(row).toLowerCase().includes(qSearch);
      const matchUser = user.name.toLowerCase().includes(qSearch) || user.point.toLowerCase().includes(qSearch) || user.role.toLowerCase().includes(qSearch);
      if (!matchQuery && !matchCat && !matchUser) return false;
    }
    return true;
  });
}

export function populateClassificationFilters() {
  const pulauSelect = document.getElementById('class-filter-pulau') as HTMLSelectElement | null;
  const regionalSelect = document.getElementById('class-filter-regional') as HTMLSelectElement | null;
  const areaSelect = document.getElementById('class-filter-area') as HTMLSelectElement | null;
  const pointSelect = document.getElementById('class-filter-point') as HTMLSelectElement | null;
  const positionSelect = document.getElementById('class-filter-position') as HTMLSelectElement | null;

  if (!pulauSelect || !regionalSelect || !areaSelect || !pointSelect) return;

  const pulauSet = new Set<string>();
  const regionalSet = new Set<string>();
  const areaSet = new Set<string>();
  const pointSet = new Set<string>();
  const positionSet = new Set<string>();

  rawChatLogs.forEach(row => {
    if (classFilterAccountType === 'REAL' && !isRealUserLog(row)) return;
    if (classFilterAccountType === 'TESTING' && isRealUserLog(row)) return;
    const user = parseSessionUser(row.session_id, row);
    pulauSet.add(user.pulau || 'Lainnya');
    regionalSet.add(user.regional || 'Lainnya');
    areaSet.add(user.area || 'Lainnya');
    pointSet.add(user.point || 'Lainnya');
    positionSet.add(user.role || 'Lainnya');
  });

  const fillSelect = (selectEl: HTMLSelectElement, set: Set<string>, allLabel: string, currentVal: string) => {
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
    const options = [`<option value="ALL">${allLabel}</option>`].concat(
      sorted.map(val => `<option value="${escapeHtml(val)}" ${val === currentVal ? 'selected' : ''}>${escapeHtml(val)}</option>`)
    );
    selectEl.innerHTML = options.join('');
  };

  fillSelect(pulauSelect, pulauSet, 'All Pulau', classFilterPulau);
  fillSelect(regionalSelect, regionalSet, 'All Regions', classFilterRegional);
  fillSelect(areaSelect, areaSet, 'All Areas', classFilterArea);
  fillSelect(pointSelect, pointSet, 'All Branch Points', classFilterPoint);
  if (positionSelect) {
    fillSelect(positionSelect, positionSet, 'All Positions', classFilterPosition);
  }
}

export function renderClassificationView() {
  const tableRows = document.getElementById('classification-table-rows');
  const statTotalQueries = document.getElementById('class-stat-total-queries');
  const statTopCategory = document.getElementById('class-stat-top-category');
  const statTopPct = document.getElementById('class-stat-top-pct');
  const statTopPosition = document.getElementById('class-stat-top-position');
  const statTopPositionPct = document.getElementById('class-stat-top-position-pct');
  const statIslandsCount = document.getElementById('class-stat-islands-count');
  const statTopIsland = document.getElementById('class-stat-top-island');
  const statBranchesCount = document.getElementById('class-stat-branches-count');
  const filterCountBadge = document.getElementById('class-filter-count-badge');
  const geoIslandsContainer = document.getElementById('class-geo-islands-container');
  const geoPointsContainer = document.getElementById('class-geo-points-container');

  if (!tableRows) return;

  const filteredLogs = getFilteredClassificationLogs();
  const total = filteredLogs.length;

  if (filterCountBadge) {
    const typeLabel = classFilterAccountType === 'REAL' ? 'Real Accounts (>20)' : (classFilterAccountType === 'TESTING' ? 'Test Accounts' : 'All Accounts');
    filterCountBadge.innerText = `${typeLabel}: ${total.toLocaleString('en-US')} turns`;
  }

  if (statTotalQueries) {
    statTotalQueries.innerText = total.toLocaleString('en-US');
  }

  if (total === 0) {
    tableRows.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-gray-400">No query logs match the selected filters.</td></tr>`;
    if (geoIslandsContainer) geoIslandsContainer.innerHTML = `<div class="text-xs text-gray-400 py-4 text-center">No distribution data available.</div>`;
    if (geoPointsContainer) geoPointsContainer.innerHTML = `<div class="text-xs text-gray-400 py-4 text-center">No branch points mapped for this dataset.</div>`;
    if (statTopCategory) statTopCategory.innerText = '—';
    if (statTopPct) statTopPct.innerText = '0%';
    if (statTopPosition) statTopPosition.innerText = '—';
    if (statTopPositionPct) statTopPositionPct.innerText = '0%';
    if (statIslandsCount) statIslandsCount.innerText = '0';
    if (statBranchesCount) statBranchesCount.innerText = '0';
    return;
  }

  // Aggregate by Category
  interface CategoryAgg {
    category: string;
    subtopicHint: string;
    count: number;
    pct: number;
    islands: Record<string, number>;
    regionals: Record<string, number>;
    points: Record<string, number>;
    positions: Record<string, number>;
    verbatimMap: Map<string, { count: number; sampleUsers: string[]; samplePoints: string[] }>;
  }

  const categoryAggs: Record<string, CategoryAgg> = {};
  CONSOLIDATED_DOMAINS.forEach(cat => {
    categoryAggs[cat] = {
      category: cat,
      subtopicHint: DOMAIN_SUBTOPICS_HINT[cat] || '',
      count: 0,
      pct: 0,
      islands: {},
      regionals: {},
      points: {},
      positions: {},
      verbatimMap: new Map(),
    };
  });

  const islandTotals: Record<string, number> = {};
  const islandRegionals: Record<string, Record<string, number>> = {};
  const regionalTotals: Record<string, number> = {};
  const pointTotals: Record<string, { count: number; area: string; regional: string; pulau: string }> = {};
  const roleTotals: Record<string, number> = {};

  filteredLogs.forEach(row => {
    const cat = getLogTopicCategory(row);
    const user = parseSessionUser(row.session_id, row);
    const qText = String(row.query || '').trim();

    if (!categoryAggs[cat]) {
      categoryAggs[cat] = {
        category: cat,
        subtopicHint: DOMAIN_SUBTOPICS_HINT[cat] || '',
        count: 0,
        pct: 0,
        islands: {},
        regionals: {},
        points: {},
        positions: {},
        verbatimMap: new Map(),
      };
    }

    const agg = categoryAggs[cat];
    agg.count++;

    const pulauName = user.pulau || 'Lainnya';
    const regName = user.regional || 'Lainnya';
    const ptName = user.point || 'Lainnya';
    const areaName = user.area || 'Lainnya';
    const roleName = user.role || 'Field Staff';

    agg.islands[pulauName] = (agg.islands[pulauName] || 0) + 1;
    agg.regionals[regName] = (agg.regionals[regName] || 0) + 1;
    agg.points[ptName] = (agg.points[ptName] || 0) + 1;
    agg.positions[roleName] = (agg.positions[roleName] || 0) + 1;

    islandTotals[pulauName] = (islandTotals[pulauName] || 0) + 1;
    regionalTotals[regName] = (regionalTotals[regName] || 0) + 1;
    roleTotals[roleName] = (roleTotals[roleName] || 0) + 1;

    if (!islandRegionals[pulauName]) {
      islandRegionals[pulauName] = {};
    }
    islandRegionals[pulauName][regName] = (islandRegionals[pulauName][regName] || 0) + 1;

    if (!pointTotals[ptName]) {
      pointTotals[ptName] = { count: 0, area: areaName, regional: regName, pulau: pulauName };
    }
    pointTotals[ptName].count++;

    if (qText) {
      if (!agg.verbatimMap.has(qText)) {
        agg.verbatimMap.set(qText, { count: 0, sampleUsers: [], samplePoints: [] });
      }
      const vEntry = agg.verbatimMap.get(qText)!;
      vEntry.count++;
      if (user.name && !vEntry.sampleUsers.includes(user.name) && vEntry.sampleUsers.length < 3) {
        vEntry.sampleUsers.push(user.name);
      }
      if (ptName && !vEntry.samplePoints.includes(ptName) && vEntry.samplePoints.length < 3) {
        vEntry.samplePoints.push(ptName);
      }
    }
  });

  const sortedAggs = Object.values(categoryAggs)
    .map(agg => {
      agg.pct = total > 0 ? (agg.count / total) * 100 : 0;
      return agg;
    })
    .sort((a, b) => b.count - a.count);

  // Top Category Stat
  const topCat = sortedAggs[0];
  if (statTopCategory && topCat) {
    statTopCategory.innerText = topCat.category;
    statTopCategory.title = topCat.category;
  }
  if (statTopPct && topCat) {
    statTopPct.innerText = `${topCat.pct.toFixed(1)}% (${topCat.count.toLocaleString('id-ID')})`;
  }

  // Top Position Stat
  const sortedRoles = Object.entries(roleTotals).sort((a, b) => b[1] - a[1]);
  const topRole = sortedRoles[0];
  if (statTopPosition && topRole) {
    statTopPosition.innerText = topRole[0];
    statTopPosition.title = topRole[0];
  }
  if (statTopPositionPct && topRole) {
    const rolePct = ((topRole[1] / total) * 100).toFixed(1);
    statTopPositionPct.innerText = `${rolePct}% (${topRole[1].toLocaleString('en-US')})`;
  }

  // Island Stat
  const uniqueIslands = Object.keys(islandTotals).filter(k => k !== 'Lainnya' && k !== '');
  if (statIslandsCount) {
    statIslandsCount.innerText = uniqueIslands.length.toString();
  }
  const sortedIslands = Object.entries(islandTotals).sort((a, b) => b[1] - a[1]);
  if (statTopIsland && sortedIslands.length > 0) {
    const topIsl = sortedIslands[0];
    const topIslPct = ((topIsl[1] / total) * 100).toFixed(1);
    statTopIsland.innerText = `Dominant: ${topIsl[0]} (${topIslPct}%)`;
  }

  // Branch Points Stat
  const uniquePoints = Object.keys(pointTotals).filter(k => k !== 'Lainnya' && k !== '');
  if (statBranchesCount) {
    statBranchesCount.innerText = uniquePoints.length.toString();
  }

  // Helper for Geographic Color Range (Acuan User):
  // > 70%: Sangat Tinggi (Hijau)
  // 51% - 70%: Tinggi (Biru)
  // 36% - 50%: Sedang (Oranye)
  // 20% - 35%: Rendah (Kuning / Amber)
  // < 20%: Di Bawah 20% (Merah)
  function getGeoColorInfo(pctNum: number): { className: string; hex: string } {
    if (pctNum > 70) return { className: 'bg-emerald-500', hex: '#10b981' };
    if (pctNum >= 51) return { className: 'bg-blue-500', hex: '#3b82f6' };
    if (pctNum >= 36) return { className: 'bg-orange-500', hex: '#f97316' };
    if (pctNum >= 20) return { className: 'bg-amber-400', hex: '#f59e0b' };
    return { className: 'bg-rose-500', hex: '#ef4444' };
  }

  // Render Card 1: Pulau & Regional Distribution
  if (geoIslandsContainer) {
    geoIslandsContainer.innerHTML = sortedIslands.map(([islName, count]) => {
      const pctNum = total > 0 ? (count / total) * 100 : 0;
      const pct = pctNum.toFixed(1);
      const colorInfo = getGeoColorInfo(pctNum);

      const regList = Object.entries(islandRegionals[islName] || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([rName, rCount]) => `<span class="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium">${escapeHtml(rName)} (${rCount})</span>`)
        .join(' ');

      return `
        <div class="space-y-1 p-2 rounded-xl hover:bg-gray-50/80 transition-colors">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-gray-900">${escapeHtml(islName)}</span>
            <div class="flex items-center gap-1.5 font-mono">
              <span class="font-extrabold" style="color: ${colorInfo.hex}">${pct}%</span>
              <span class="text-gray-400 text-[11px]">(${count.toLocaleString('en-US')} turns)</span>
            </div>
          </div>
          <div class="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div class="h-full rounded-full ${colorInfo.className}" style="width: ${pct}%; background-color: ${colorInfo.hex} !important;"></div>
          </div>
          ${regList ? `<div class="pt-0.5 flex flex-wrap gap-1">${regList}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Render Card 2: Top Points & Area
  if (geoPointsContainer) {
    const sortedPoints = Object.entries(pointTotals)
      .filter(([pt]) => pt !== 'Lainnya')
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    // Full height for <= 10 items; scroll only if items exceed 10
    if (sortedPoints.length > 10) {
      geoPointsContainer.className = "space-y-2 pt-1 max-h-[520px] overflow-y-auto pr-1";
    } else {
      geoPointsContainer.className = "space-y-2 pt-1";
    }

    if (sortedPoints.length === 0) {
      geoPointsContainer.innerHTML = `<div class="text-xs text-gray-400 py-4 text-center">No branch points mapped for this dataset.</div>`;
    } else {
      geoPointsContainer.innerHTML = sortedPoints.map(([pt, info], idx) => {
        const pct = ((info.count / total) * 100).toFixed(1);
        return `
          <div class="flex items-center justify-between p-2 rounded-xl bg-gray-50/60 hover:bg-gray-100/80 transition-colors border border-gray-100">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0 shadow-2xs">${idx + 1}</span>
              <div class="min-w-0">
                <div class="font-bold text-gray-900 text-xs truncate">${escapeHtml(pt)}</div>
                <div class="text-[10px] text-gray-400 truncate">
                  ${info.area ? escapeHtml(info.area) : ''}${info.regional ? ` • ${escapeHtml(info.regional)}` : ''}${info.pulau ? ` (${escapeHtml(info.pulau)})` : ''}
                </div>
              </div>
            </div>
            <div class="text-right shrink-0 font-mono text-xs pl-2">
              <span class="font-bold text-gray-900">${info.count}</span>
              <span class="text-[10px] text-gray-400 block">${pct}%</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Main Table Rows
  tableRows.innerHTML = sortedAggs.map((agg, idx) => {
    const verbatimCount = agg.verbatimMap.size;
    const sortedVerbatims = Array.from(agg.verbatimMap.entries()).sort((a, b) => b[1].count - a[1].count);

    const islandBadges = Object.entries(agg.islands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([isl, cnt]) => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
          <span>${escapeHtml(isl)}</span>
          <span class="text-gray-400">(${cnt})</span>
        </span>
      `).join(' ');

    const positionBadges = Object.entries(agg.positions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pos, cnt]) => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
          <span>${escapeHtml(pos)}</span>
          <span class="text-gray-400">(${cnt})</span>
        </span>
      `).join(' ');

    const accordionId = `class-accordion-${idx}`;

    return `
      <!-- Main Category Row -->
      <tr class="hover:bg-gray-50/80 transition-colors group">
        <td class="py-3 px-4 text-center font-mono text-gray-400 font-bold">${idx + 1}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-gray-900 text-xs">${escapeHtml(agg.category)}</div>
          <div class="mt-0.5 text-[11px] text-gray-400 leading-snug line-clamp-2">${escapeHtml(agg.subtopicHint)}</div>
        </td>
        <td class="py-3 px-4 text-right">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-900 border border-gray-200/80 font-mono">
            ${agg.count.toLocaleString('en-US')}
          </span>
        </td>
        <td class="py-3 px-4 text-right font-mono font-extrabold text-gray-900">
          ${agg.pct.toFixed(2)}%
        </td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap gap-1">
            ${islandBadges || '<span class="text-gray-400 text-[10px]">—</span>'}
          </div>
        </td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap gap-1">
            ${positionBadges || '<span class="text-gray-400 text-[10px]">—</span>'}
          </div>
        </td>
        <td class="py-3 px-4 text-center">
          <button
            type="button"
            data-target="${accordionId}"
            class="btn-toggle-verbatim px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700 shadow-2xs cursor-pointer transition-all flex items-center justify-center gap-1 mx-auto"
          >
            <span>Verbatim (${verbatimCount})</span>
            <svg class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </td>
      </tr>

      <!-- Expandable Verbatim Queries Details Row -->
      <tr id="${accordionId}" class="hidden bg-gray-50/40 border-y border-gray-200/60">
        <td colspan="7" class="p-4 sm:p-5">
          <div class="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-gray-900"></span>
                <span class="text-xs font-bold text-gray-900">Field Verbatim Query Variations</span>
                <span class="text-[11px] font-mono text-gray-400">(${sortedVerbatims.length} unique variations, total ${agg.count} turns)</span>
              </div>
              <button
                type="button"
                data-cat="${escapeHtml(agg.category)}"
                class="btn-copy-verbatims text-[11px] font-semibold text-gray-700 hover:text-black cursor-pointer flex items-center gap-1 self-start sm:self-auto"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                <span>Copy All Verbatims</span>
              </button>
            </div>

            <!-- Verbatim Items Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              ${sortedVerbatims.map(([qStr, vInfo]) => {
                const samplePts = vInfo.samplePoints.filter(Boolean).join(', ');
                return `
                  <div class="p-2.5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-300 transition-all text-xs flex flex-col justify-between">
                    <div class="flex items-start justify-between gap-2">
                      <div class="font-medium text-gray-900 leading-snug">“${escapeHtml(qStr)}”</div>
                      ${vInfo.count > 1 ? `
                        <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 font-mono font-bold text-[10px] shrink-0">
                          ${vInfo.count}x
                        </span>
                      ` : ''}
                    </div>
                    ${samplePts ? `
                      <div class="mt-1.5 text-[10px] text-gray-400 font-sans flex items-center gap-1 truncate">
                        <span>📍 Origin:</span>
                        <span class="text-gray-600 truncate">${escapeHtml(samplePts)}</span>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach Accordion Toggle Listeners
  document.querySelectorAll('.btn-toggle-verbatim').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      const isHidden = targetEl.classList.contains('hidden');
      if (isHidden) {
        targetEl.classList.remove('hidden');
        btn.querySelector('svg')?.classList.add('rotate-180');
      } else {
        targetEl.classList.add('hidden');
        btn.querySelector('svg')?.classList.remove('rotate-180');
      }
    });
  });

  // Attach Copy Verbatim Listeners
  document.querySelectorAll('.btn-copy-verbatims').forEach(btn => {
    btn.addEventListener('click', () => {
      const catName = btn.getAttribute('data-cat');
      if (!catName || !categoryAggs[catName]) return;
      const agg = categoryAggs[catName];
      const sortedVerbatims = Array.from(agg.verbatimMap.entries()).sort((a, b) => b[1].count - a[1].count);
      const textToCopy = sortedVerbatims.map(([qStr, vInfo]) => vInfo.count > 1 ? `• ${qStr} (${vInfo.count}x)` : `• ${qStr}`).join('\n');
      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = `<span class="text-gray-900 font-bold">✓ Copied!</span>`;
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      });
    });
  });
}

export function exportClassificationCsv() {
  const filteredLogs = getFilteredClassificationLogs();
  if (filteredLogs.length === 0) {
    alert('No classification data available for export with current filters.');
    return;
  }

  const catMap = new Map<string, { count: number; islands: Set<string>; positions: Map<string, number>; verbatims: Map<string, number> }>();
  CONSOLIDATED_DOMAINS.forEach(cat => {
    catMap.set(cat, { count: 0, islands: new Set(), positions: new Map(), verbatims: new Map() });
  });

  filteredLogs.forEach(row => {
    const cat = getLogTopicCategory(row);
    const user = parseSessionUser(row.session_id, row);
    const qText = String(row.query || '').trim();

    if (!catMap.has(cat)) {
      catMap.set(cat, { count: 0, islands: new Set(), positions: new Map(), verbatims: new Map() });
    }
    const entry = catMap.get(cat)!;
    entry.count++;
    if (user.pulau) entry.islands.add(user.pulau);
    const roleName = user.role || 'Field Staff';
    entry.positions.set(roleName, (entry.positions.get(roleName) || 0) + 1);
    if (qText) {
      entry.verbatims.set(qText, (entry.verbatims.get(qText) || 0) + 1);
    }
  });

  const total = filteredLogs.length;
  const csvEsc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = [
    'No',
    'Classification & Field Subtopics',
    'Frequency',
    '% Total',
    'Pulau Distribution',
    'Position Distribution',
    'Field Verbatim Queries',
  ];

  const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1].count - a[1].count);
  const lines = [headers.map(csvEsc).join(',')];

  sortedCats.forEach(([catName, info], idx) => {
    const pct = total > 0 ? ((info.count / total) * 100).toFixed(2) + '%' : '0%';
    const islText = Array.from(info.islands).join(', ');
    const posText = Array.from(info.positions.entries()).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} (${c})`).join(', ');
    const sortedV = Array.from(info.verbatims.entries()).sort((a, b) => b[1] - a[1]);
    const verbatimText = sortedV.map(([qStr, c]) => c > 1 ? `• ${qStr} (${c}x)` : `• ${qStr}`).join('\n');

    lines.push([
      idx + 1,
      catName,
      info.count,
      pct,
      islText,
      posText,
      verbatimText,
    ].map(csvEsc).join(','));
  });

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `klasifikasi_query_user_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function initLogsTab() {
  const logSearchInput = document.getElementById('log-search-input');
  const logIntentFilter = document.getElementById('log-intent-filter');
  const btnExportLogsCsv = document.getElementById('btn-export-logs-csv');
  const btnLogPrev = document.getElementById('btn-log-prev');
  const btnLogNext = document.getElementById('btn-log-next');

  const logSubtabBtns = document.querySelectorAll<HTMLButtonElement>('.log-subtab-btn');
  const logSubtabPanes = document.querySelectorAll<HTMLElement>('.log-subtab-pane');

  const explorerSearchInput = document.getElementById('explorer-search-input');
  const ltmSearchInput = document.getElementById('ltm-search-input');
  const threadModal = document.getElementById('thread-modal') as HTMLDialogElement | null;
  const btnCloseThreadModal = document.getElementById('btn-close-thread-modal');

  // Classification Filter Controls
  const classFilterPulauSelect = document.getElementById('class-filter-pulau') as HTMLSelectElement | null;
  const classFilterRegionalSelect = document.getElementById('class-filter-regional') as HTMLSelectElement | null;
  const classFilterAreaSelect = document.getElementById('class-filter-area') as HTMLSelectElement | null;
  const classFilterPointSelect = document.getElementById('class-filter-point') as HTMLSelectElement | null;
  const classFilterPositionSelect = document.getElementById('class-filter-position') as HTMLSelectElement | null;
  const classFilterSearchInput = document.getElementById('class-filter-search') as HTMLInputElement | null;
  const classFilterAccountSelect = document.getElementById('class-filter-account') as HTMLSelectElement | null;
  const btnResetClassFilters = document.getElementById('btn-reset-class-filters');
  const btnExportClassCsv = document.getElementById('btn-export-classification-csv');

  if (classFilterAccountSelect) {
    classFilterAccountSelect.addEventListener('change', () => {
      classFilterAccountType = classFilterAccountSelect.value;
      populateClassificationFilters();
      renderClassificationView();
    });
  }

  if (classFilterPulauSelect) {
    classFilterPulauSelect.addEventListener('change', () => {
      classFilterPulau = classFilterPulauSelect.value;
      renderClassificationView();
    });
  }

  if (classFilterRegionalSelect) {
    classFilterRegionalSelect.addEventListener('change', () => {
      classFilterRegional = classFilterRegionalSelect.value;
      renderClassificationView();
    });
  }

  if (classFilterAreaSelect) {
    classFilterAreaSelect.addEventListener('change', () => {
      classFilterArea = classFilterAreaSelect.value;
      renderClassificationView();
    });
  }

  if (classFilterPointSelect) {
    classFilterPointSelect.addEventListener('change', () => {
      classFilterPoint = classFilterPointSelect.value;
      renderClassificationView();
    });
  }

  if (classFilterPositionSelect) {
    classFilterPositionSelect.addEventListener('change', () => {
      classFilterPosition = classFilterPositionSelect.value;
      renderClassificationView();
    });
  }

  if (classFilterSearchInput) {
    classFilterSearchInput.addEventListener('input', () => {
      classFilterSearch = classFilterSearchInput.value;
      renderClassificationView();
    });
  }

  if (btnResetClassFilters) {
    btnResetClassFilters.addEventListener('click', () => {
      classFilterPulau = 'ALL';
      classFilterRegional = 'ALL';
      classFilterArea = 'ALL';
      classFilterPoint = 'ALL';
      classFilterPosition = 'ALL';
      classFilterAccountType = 'REAL';
      classFilterSearch = '';
      if (classFilterPulauSelect) classFilterPulauSelect.value = 'ALL';
      if (classFilterRegionalSelect) classFilterRegionalSelect.value = 'ALL';
      if (classFilterAreaSelect) classFilterAreaSelect.value = 'ALL';
      if (classFilterPointSelect) classFilterPointSelect.value = 'ALL';
      if (classFilterPositionSelect) classFilterPositionSelect.value = 'ALL';
      if (classFilterAccountSelect) classFilterAccountSelect.value = 'REAL';
      if (classFilterSearchInput) classFilterSearchInput.value = '';
      populateClassificationFilters();
      renderClassificationView();
    });
  }

  if (btnExportClassCsv) {
    btnExportClassCsv.addEventListener('click', exportClassificationCsv);
  }

  if (btnCloseThreadModal && threadModal) {
    btnCloseThreadModal.addEventListener('click', () => threadModal.close());
    threadModal.addEventListener('click', (e) => {
      if (e.target === threadModal) threadModal.close();
    });
  }

  if (logSearchInput) {
    logSearchInput.addEventListener('input', () => {
      chatLogPage = 1;
      renderChatLogsTable();
    });
  }

  if (logIntentFilter) {
    logIntentFilter.addEventListener('change', () => {
      chatLogPage = 1;
      renderChatLogsTable();
    });
  }

  if (btnExportLogsCsv) {
    btnExportLogsCsv.addEventListener('click', exportFilteredLogsToCsv);
  }

  if (btnLogPrev) {
    btnLogPrev.addEventListener('click', () => {
      if (chatLogPage > 1) {
        chatLogPage--;
        renderChatLogsTable();
      }
    });
  }

  if (btnLogNext) {
    btnLogNext.addEventListener('click', async () => {
      const filtered = getFilteredLogs();
      const totalPages = Math.ceil(filtered.length / CHAT_LOG_PAGE_SIZE);

      if (chatLogPage < totalPages) {
        chatLogPage++;
        renderChatLogsTable();
      } else if (nextLogCursor && !isLoadingMoreLogs) {
        isLoadingMoreLogs = true;
        try {
          const res = await fetch(`/api/logs?limit=500&cursor=${encodeURIComponent(nextLogCursor)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.logs && data.logs.length > 0) {
              rawChatLogs = rawChatLogs.concat(data.logs);
            }
            nextLogCursor = data.next_cursor || null;
            chatLogPage++;
            renderChatLogsTable();
            populateClassificationFilters();
            if (activeLogSubtab === 'classification') {
              renderClassificationView();
            }
          }
        } catch (e) {
          console.error('Failed to fetch more logs:', e);
        } finally {
          isLoadingMoreLogs = false;
        }
      }
    });
  }

  logSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-log-subtab') || 'recent';
      if (subtab === activeLogSubtab) return;
      activeLogSubtab = subtab;

      logSubtabBtns.forEach(b => {
        b.classList.remove('active', 'text-gray-900', 'bg-white', 'border', 'border-gray-200/80', 'shadow-xs', 'font-bold');
        b.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100', 'font-semibold');
      });
      btn.classList.add('active', 'text-gray-900', 'bg-white', 'border', 'border-gray-200/80', 'shadow-xs', 'font-bold');
      btn.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100', 'font-semibold');

      logSubtabPanes.forEach(p => p.classList.add('hidden'));
      const targetPane = document.getElementById(`subtab-pane-${subtab}`);
      if (targetPane) targetPane.classList.remove('hidden');

      if (subtab === 'explorer') {
        renderSessionExplorer();
      } else if (subtab === 'ltm') {
        renderLTMTable();
      } else if (subtab === 'classification') {
        renderClassificationView();
      }
    });
  });

  if (explorerSearchInput) {
    explorerSearchInput.addEventListener('input', renderSessionExplorer);
  }

  if (ltmSearchInput) {
    ltmSearchInput.addEventListener('input', renderLTMTable);
  }
}
