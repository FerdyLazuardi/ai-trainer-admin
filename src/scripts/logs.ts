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

export function parseSessionUser(sessionId: string) {
  if (!sessionId || sessionId === 'Unknown' || sessionId === 'dev_user_123') {
    return { name: 'Admin / Dev', role: 'HQ Operator', id: 'dev', location: '', raw: sessionId || '—' };
  }
  const parts = sessionId.split('_');
  if (parts.length <= 1) {
    return { name: sessionId, role: 'Employee', id: sessionId, location: '', raw: sessionId };
  }

  const id = parts[0];
  const roleMarkers = ['fo', 'ho', 'admin', 'bm', 'bp', 'am', 'area', 'manager', 'staff', 'lead', 'business', 'officer'];
  
  let markerIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (roleMarkers.includes(parts[i].toLowerCase())) {
      markerIdx = i;
      break;
    }
  }

  let name = '';
  let roleTokens: string[] = [];
  let locationTokens: string[] = [];

  if (markerIdx > 1) {
    name = parts.slice(1, markerIdx).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    const remainder = parts.slice(markerIdx).filter(s => s.toLowerCase() !== 'n/a' && s.toLowerCase() !== 'na');
    
    const roleTerminalWords = ['manager', 'partner', 'officer', 'leader', 'staff', 'admin', 'coordinator', 'specialist', 'analyst', 'head', 'lead'];
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
    name = parts.slice(1).filter(s => s.toLowerCase() !== 'na').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || `User #${id}`;
    roleTokens = ['Staff'];
  } else {
    name = parts.slice(1).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    roleTokens = ['Employee'];
  }

  const formattedRole = roleTokens.map(s => {
    const lower = s.toLowerCase();
    if (lower === 'fo' || lower === 'ho' || lower === 'bm' || lower === 'bp' || lower === 'am') return lower.toUpperCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }).join(' ');

  const formattedLocation = locationTokens.map(s => s.toUpperCase()).join(' ');

  return {
    name: name || `User #${id}`,
    role: formattedRole || 'Field Staff',
    location: formattedLocation || '',
    id: id,
    raw: sessionId,
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
    const res = await fetch('/api/logs?limit=500');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const kpis = data.kpis || {};
    let logs = data.logs || [];
    const intents = data.intents || [];
    const trends = data.trends || [];
    const users = data.users || [];

    nextLogCursor = data.next_cursor || null;

    if (nextLogCursor) {
      try {
        const res2 = await fetch(`/api/logs?limit=500&cursor=${encodeURIComponent(nextLogCursor)}`);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.logs && data2.logs.length > 0) {
            logs = logs.concat(data2.logs);
          }
          nextLogCursor = data2.next_cursor || null;
        }
      } catch (e) {
        console.warn('Background log fetch error:', e);
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
    }

  } catch (err: any) {
    console.error('Failed to load chat logs:', err);
    if (chatLogsRows) {
      chatLogsRows.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-rose-600 font-mono">Error loading logs: ${err.message}</td></tr>`;
    }
  }
}

export function renderChatLogsTable() {
  const chatLogsRows = document.getElementById('chat-logs-rows');
  const logSearchInput = document.getElementById('log-search-input') as HTMLInputElement | null;
  const logIntentFilter = document.getElementById('log-intent-filter') as HTMLSelectElement | null;
  const logPageIndicator = document.getElementById('log-page-indicator');
  const logCurrentPage = document.getElementById('log-current-page');
  const btnLogPrev = document.getElementById('btn-log-prev') as HTMLButtonElement | null;
  const btnLogNext = document.getElementById('btn-log-next') as HTMLButtonElement | null;

  if (!chatLogsRows) return;

  const q = (logSearchInput?.value || '').toLowerCase().trim();
  const intentFilter = logIntentFilter?.value || 'ALL';

  const filtered = rawChatLogs.filter(row => {
    if (intentFilter !== 'ALL' && row.intent !== intentFilter) return false;
    if (q) {
      const queryMatch = (row.query || '').toLowerCase().includes(q);
      const sessionMatch = (row.session_id || '').toLowerCase().includes(q);
      const answerMatch = (row.answer || '').toLowerCase().includes(q);
      if (!queryMatch && !sessionMatch && !answerMatch) return false;
    }
    return true;
  });

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
    const user = parseSessionUser(row.session_id);
    const costIdr = Math.round((row.cost || 0) * USD_TO_IDR);
    const latSec = ((row.latency_ms || 0) / 1000).toFixed(2);

    return `
      <tr data-log-index="${globalIdx}" class="chat-log-row hover:bg-gray-50/80 transition-colors cursor-pointer group">
        <td class="py-3 px-4 font-mono text-gray-500 tabular-nums whitespace-nowrap text-xs">
          ${formatTimeNumeric(row.created_at)}
        </td>
        <td class="py-3 px-4">
          <div class="font-bold text-gray-900 truncate max-w-[170px]" title="${escapeHtml(row.session_id || '')}">${escapeHtml(user.name)}</div>
          <div class="mt-0.5">
            <span class="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium text-[10px] whitespace-nowrap truncate max-w-[170px]">
              ${escapeHtml(user.role)}
            </span>
          </div>
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

      const user = parseSessionUser(row.session_id);
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
              <span class="px-2 py-0.5 rounded-md bg-gray-200 text-gray-800 font-mono text-[10px] font-bold">User ID: ${escapeHtml(user.id)}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700">
              <div><span class="text-gray-400">Full Name:</span> <strong class="text-gray-900 ml-1">${escapeHtml(user.name)}</strong></div>
              <div><span class="text-gray-400">Position:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.role)}</span></div>
              ${user.location ? `<div><span class="text-gray-400">Branch Point:</span> <span class="font-semibold text-gray-900 ml-1">${escapeHtml(user.location)}</span></div>` : ''}
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
    const user = parseSessionUser(sId);
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
    const matchId = s.sessionId.toLowerCase().includes(q);
    const matchName = s.user.name.toLowerCase().includes(q);
    const matchRole = s.user.role.toLowerCase().includes(q);
    return matchId || matchName || matchRole;
  });

  if (filtered.length === 0) {
    sessionSummaryRows.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400">No matching sessions found.</td></tr>`;
    return;
  }

  sessionSummaryRows.innerHTML = filtered.map((s, idx) => `
    <tr data-session-idx="${idx}" class="session-summary-row hover:bg-gray-50/80 transition-colors cursor-pointer group">
      <td class="py-3 px-4">
        <div class="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">${escapeHtml(s.user.name)}</div>
        <div class="mt-0.5">
          <span class="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium text-[10px]">
            ${escapeHtml(s.user.role)}
          </span>
        </div>
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
  `).join('');

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

  threadSessionTitle.innerText = `${sessionGroup.user.name} (${sessionGroup.user.role})`;
  threadSessionSubtitle.innerText = `Session ID: ${sessionGroup.sessionId} • ${sessionGroup.turnsCount} turns • Latest: ${formatTimeNumeric(sessionGroup.latestActivity)}`;

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

export function initLogsTab() {
  const logSearchInput = document.getElementById('log-search-input');
  const logIntentFilter = document.getElementById('log-intent-filter');
  const btnLogPrev = document.getElementById('btn-log-prev');
  const btnLogNext = document.getElementById('btn-log-next');

  const logSubtabBtns = document.querySelectorAll<HTMLButtonElement>('.log-subtab-btn');
  const logSubtabPanes = document.querySelectorAll<HTMLElement>('.log-subtab-pane');

  const explorerSearchInput = document.getElementById('explorer-search-input');
  const ltmSearchInput = document.getElementById('ltm-search-input');
  const threadModal = document.getElementById('thread-modal') as HTMLDialogElement | null;
  const btnCloseThreadModal = document.getElementById('btn-close-thread-modal');

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
      const q = (logSearchInput as HTMLInputElement)?.value?.toLowerCase().trim() || '';
      const intentFilter = (logIntentFilter as HTMLSelectElement)?.value || 'ALL';
      const filtered = rawChatLogs.filter(row => {
        if (intentFilter !== 'ALL' && row.intent !== intentFilter) return false;
        if (q) {
          const queryMatch = (row.query || '').toLowerCase().includes(q);
          const sessionMatch = (row.session_id || '').toLowerCase().includes(q);
          const answerMatch = (row.answer || '').toLowerCase().includes(q);
          if (!queryMatch && !sessionMatch && !answerMatch) return false;
        }
        return true;
      });
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
