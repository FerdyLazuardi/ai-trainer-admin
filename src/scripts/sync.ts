// src/scripts/sync.ts
import { notify, formatTime } from './utils';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// =========================================================================
// 1. TELEMETRY LOADERS (EMPLOYEE & COURSES)
// =========================================================================

export async function loadSyncTelemetry() {
  await Promise.allSettled([
    loadEmployeeTelemetry(),
    loadHistoryTelemetry(),
    loadCourseTelemetry(),
  ]);
}

async function loadEmployeeTelemetry() {
  const statUserCount = document.getElementById('stat-user-count');
  const statBranchCount = document.getElementById('stat-branch-count');
  const statCadenceBadge = document.getElementById('stat-cadence-badge');
  const statCadenceDetail = document.getElementById('stat-cadence-detail');
  const statStatusDot = document.getElementById('stat-status-dot');
  const statStatusText = document.getElementById('stat-status-text');
  const statLastTime = document.getElementById('stat-last-time');
  const ledgerRows = document.getElementById('ledger-rows');
  const kpiTotalBadge = document.getElementById('kpi-total-badge');

  const schedEnabled = document.getElementById('sched-enabled') as HTMLInputElement | null;
  const schedHour = document.getElementById('sched-hour') as HTMLSelectElement | null;
  const schedDay = document.getElementById('sched-day') as HTMLSelectElement | null;
  const fieldDayOfWeek = document.getElementById('field-day-of-week');

  try {
    const res = await fetch('/api/schedule');
    if (!res.ok) throw new Error('API unreachable');
    const data = await res.json();

    if (schedEnabled) schedEnabled.checked = Boolean(data.enabled);
    if (schedHour) schedHour.value = String(data.hour ?? 2);
    const type = data.schedule_type || 'daily';
    const radio = document.querySelector<HTMLInputElement>(`input[name="schedule_type"][value="${type}"]`);
    if (radio) radio.checked = true;

    if (fieldDayOfWeek && schedDay) {
      if (type === 'weekly') {
        fieldDayOfWeek.classList.remove('hidden');
        schedDay.value = String(data.day_of_week ?? 0);
      } else {
        fieldDayOfWeek.classList.add('hidden');
      }
    }
    updateRuleSummary();

    if (statCadenceBadge && statCadenceDetail) {
      if (data.enabled) {
        statCadenceBadge.innerText = type === 'weekly' ? `Weekly (${dayNames[data.day_of_week ?? 0]})` : 'Daily Active';
        statCadenceBadge.className = 'text-sm font-bold text-emerald-600';
        statCadenceDetail.innerText = `Trigger: ${String(data.hour ?? 2).padStart(2, '0')}:00 WIB`;
      } else {
        statCadenceBadge.innerText = 'Disabled';
        statCadenceBadge.className = 'text-sm font-bold text-gray-500';
        statCadenceDetail.innerText = 'Manual dispatch only';
      }
    }

    if (statLastTime) statLastTime.innerText = formatTime(data.last_run_at);

    if (statStatusDot && statStatusText) {
      if (data.last_status === 'success') {
        statStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        statStatusText.innerText = 'SUCCESS';
        statStatusText.className = 'text-sm font-bold text-emerald-600';
      } else if (data.last_status === 'failed') {
        statStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
        statStatusText.innerText = 'FAILED';
        statStatusText.className = 'text-sm font-bold text-rose-600';
      } else if (data.last_status === 'BACKEND_NOT_DEPLOYED') {
        if (statCadenceBadge) {
          statCadenceBadge.innerText = 'Deploy Pending';
          statCadenceBadge.className = 'text-sm font-bold text-amber-600';
        }
        statStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
        statStatusText.innerText = 'NOT DEPLOYED';
      } else {
        statStatusDot.className = 'w-2 h-2 rounded-full bg-gray-400';
        statStatusText.innerText = data.last_status || 'IDLE';
        statStatusText.className = 'text-sm font-bold text-gray-700';
      }
    }

    // Live count from PostgreSQL table user_kpi_data
    try {
      const kpiRes = await fetch('/api/kpi?scope=users&page=1&limit=1');
      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        const liveTotal = kpiData.total ?? kpiData.users_total ?? 0;
        if (statUserCount) statUserCount.innerText = Number(liveTotal).toLocaleString('id-ID');
        if (kpiTotalBadge) kpiTotalBadge.innerText = Number(liveTotal).toLocaleString('id-ID');
      } else if (statUserCount) {
        statUserCount.innerText = '0';
      }
    } catch {
      if (statUserCount) statUserCount.innerText = '0';
    }

    if (ledgerRows) {
      if (data.last_result) {
        const u = data.last_result.users_updated ?? 0;
        const b = data.last_result.branches_updated ?? 0;
        if (statBranchCount) statBranchCount.innerText = b.toLocaleString('id-ID');

        ledgerRows.innerHTML = `
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="py-2.5 px-2.5 text-gray-900 tabular-nums">${formatTime(data.last_run_at)}</td>
            <td class="py-2.5 px-2.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                data.last_status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }">
                ${(data.last_status || 'UNKNOWN').toUpperCase()}
              </span>
            </td>
            <td class="py-2.5 px-2.5 tabular-nums text-gray-900 font-bold">${u.toLocaleString('id-ID')}</td>
            <td class="py-2.5 px-2.5 tabular-nums text-gray-600">${b.toLocaleString('id-ID')}</td>
            <td class="py-2.5 px-2.5 text-right">
              <span class="text-gray-400 text-[10px]">Verified Staged</span>
            </td>
          </tr>
        `;
      } else {
        ledgerRows.innerHTML = `<tr><td colspan="5" class="py-5 text-center text-gray-400 font-sans text-xs">No previous execution recorded.</td></tr>`;
      }
    }
  } catch (err) {
    console.error('Failed to load employee telemetry:', err);
  }
}

async function loadHistoryTelemetry() {
  const historyStatCount = document.getElementById('history-stat-count');
  const historyStatCadenceBadge = document.getElementById('history-stat-cadence-badge');
  const historyStatCadenceDetail = document.getElementById('history-stat-cadence-detail');
  const historyStatStatusDot = document.getElementById('history-stat-status-dot');
  const historyStatStatusText = document.getElementById('history-stat-status-text');
  const historyStatLastTime = document.getElementById('history-stat-last-time');
  const historyLedgerRows = document.getElementById('history-ledger-rows');

  const historySchedEnabled = document.getElementById('history-sched-enabled') as HTMLInputElement | null;
  const historySchedHour = document.getElementById('history-sched-hour') as HTMLSelectElement | null;
  const historySchedDay = document.getElementById('history-sched-day') as HTMLSelectElement | null;
  const historyFieldDayOfWeek = document.getElementById('history-field-day-of-week');

  try {
    const res = await fetch('/api/history/schedule');
    if (!res.ok) throw new Error('API unreachable');
    const data = await res.json();

    if (historySchedEnabled) historySchedEnabled.checked = Boolean(data.enabled);
    if (historySchedHour) historySchedHour.value = String(data.hour ?? 3);
    const type = data.schedule_type || 'daily';
    const radio = document.querySelector<HTMLInputElement>(`input[name="history_schedule_type"][value="${type}"]`);
    if (radio) radio.checked = true;

    if (historyFieldDayOfWeek && historySchedDay) {
      if (type === 'weekly') {
        historyFieldDayOfWeek.classList.remove('hidden');
        historySchedDay.value = String(data.day_of_week ?? 0);
      } else {
        historyFieldDayOfWeek.classList.add('hidden');
      }
    }
    updateHistoryRuleSummary();

    if (historyStatCadenceBadge && historyStatCadenceDetail) {
      if (data.enabled) {
        historyStatCadenceBadge.innerText = type === 'weekly' ? `Weekly (${dayNames[data.day_of_week ?? 0]})` : 'Daily Active';
        historyStatCadenceBadge.className = 'text-sm font-bold text-emerald-600';
        historyStatCadenceDetail.innerText = `Trigger: ${String(data.hour ?? 3).padStart(2, '0')}:00 WIB`;
      } else {
        historyStatCadenceBadge.innerText = 'Disabled';
        historyStatCadenceBadge.className = 'text-sm font-bold text-gray-500';
        historyStatCadenceDetail.innerText = 'Manual dispatch only';
      }
    }

    if (historyStatLastTime) historyStatLastTime.innerText = formatTime(data.last_run_at);

    if (historyStatStatusDot && historyStatStatusText) {
      if (data.last_status === 'success') {
        historyStatStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        historyStatStatusText.innerText = 'SUCCESS';
        historyStatStatusText.className = 'text-sm font-bold text-emerald-600';
      } else if (data.last_status === 'failed') {
        historyStatStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
        historyStatStatusText.innerText = 'FAILED';
        historyStatStatusText.className = 'text-sm font-bold text-rose-600';
      } else if (data.last_status === 'BACKEND_NOT_DEPLOYED') {
        if (historyStatCadenceBadge) {
          historyStatCadenceBadge.innerText = 'Deploy Pending';
          historyStatCadenceBadge.className = 'text-sm font-bold text-amber-600';
        }
        historyStatStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
        historyStatStatusText.innerText = 'NOT DEPLOYED';
      } else if (data.last_status === 'CORRUPTED' || !data.last_status || data.last_status === 'IDLE') {
        let hasLocal = false;
        try {
          const cached = localStorage.getItem('cag:history:last_run');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.last_status === 'success') {
              hasLocal = true;
              historyStatStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
              historyStatStatusText.innerText = 'SUCCESS';
              historyStatStatusText.className = 'text-sm font-bold text-emerald-600';
              if (historyStatLastTime) historyStatLastTime.innerText = formatTime(parsed.last_run_at);
            }
          }
        } catch {}
        if (!hasLocal) {
          historyStatStatusDot.className = 'w-2 h-2 rounded-full bg-gray-400';
          historyStatStatusText.innerText = 'IDLE';
          historyStatStatusText.className = 'text-sm font-bold text-gray-700';
        }
      } else {
        historyStatStatusDot.className = 'w-2 h-2 rounded-full bg-gray-400';
        historyStatStatusText.innerText = data.last_status || 'IDLE';
        historyStatStatusText.className = 'text-sm font-bold text-gray-700';
      }
    }

    // Live count from PostgreSQL table user_kpi_history
    try {
      const summaryRes = await fetch('/api/history/summary');
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        const totalCount = summaryData.total ?? summaryData.active ?? 0;
        if (historyStatCount) historyStatCount.innerText = Number(totalCount).toLocaleString('id-ID');
      } else if (historyStatCount) {
        historyStatCount.innerText = '0';
      }
    } catch {
      if (historyStatCount) historyStatCount.innerText = '0';
    }

    if (historyLedgerRows) {
      let displayResult = data.last_result;
      let displayStatus = data.last_status;
      let displayTime = data.last_run_at;

      if (!displayResult) {
        try {
          const cached = localStorage.getItem('cag:history:last_run');
          if (cached) {
            const parsed = JSON.parse(cached);
            displayResult = parsed.last_result;
            displayStatus = parsed.last_status || displayStatus;
            displayTime = parsed.last_run_at || displayTime;
          }
        } catch {}
      }

      if (displayResult) {
        const updated = displayResult.history_updated ?? displayResult.updated ?? 0;
        const scope = displayResult.scope || 'score_trend';

        historyLedgerRows.innerHTML = `
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="py-2.5 px-2.5 text-gray-900 tabular-nums">${formatTime(displayTime)}</td>
            <td class="py-2.5 px-2.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                displayStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }">
                ${(displayStatus || 'UNKNOWN').toUpperCase()}
              </span>
            </td>
            <td class="py-2.5 px-2.5 tabular-nums text-gray-900 font-bold">${updated.toLocaleString('id-ID')}</td>
            <td class="py-2.5 px-2.5 tabular-nums text-gray-600">${scope}</td>
            <td class="py-2.5 px-2.5 text-right">
              <span class="text-gray-400 text-[10px]">Verified Staged</span>
            </td>
          </tr>
        `;
      } else {
        historyLedgerRows.innerHTML = `<tr><td colspan="5" class="py-5 text-center text-gray-400 font-sans text-xs">No previous execution recorded.</td></tr>`;
      }
    }
  } catch (err) {
    console.error('Failed to load history telemetry:', err);
  }
}

async function loadCourseTelemetry() {
  const courseStatCount = document.getElementById('course-stat-count');
  const courseStatCadenceBadge = document.getElementById('course-stat-cadence-badge');
  const courseStatCadenceDetail = document.getElementById('course-stat-cadence-detail');
  const courseStatStatusDot = document.getElementById('course-stat-status-dot');
  const courseStatStatusText = document.getElementById('course-stat-status-text');
  const courseStatLastTime = document.getElementById('course-stat-last-time');
  const courseLedgerRows = document.getElementById('course-ledger-rows');

  const courseSchedEnabled = document.getElementById('course-sched-enabled') as HTMLInputElement | null;
  const courseSchedHour = document.getElementById('course-sched-hour') as HTMLSelectElement | null;
  const courseSchedDay = document.getElementById('course-sched-day') as HTMLSelectElement | null;
  const courseFieldDayOfWeek = document.getElementById('course-field-day-of-week');

  try {
    const res = await fetch('/api/courses/schedule');
    if (!res.ok) throw new Error('API unreachable');
    const data = await res.json();

    if (courseSchedEnabled) courseSchedEnabled.checked = Boolean(data.enabled);
    if (courseSchedHour) courseSchedHour.value = String(data.hour ?? 3);
    const type = data.schedule_type || 'daily';
    const radio = document.querySelector<HTMLInputElement>(`input[name="course_schedule_type"][value="${type}"]`);
    if (radio) radio.checked = true;

    if (courseFieldDayOfWeek && courseSchedDay) {
      if (type === 'weekly') {
        courseFieldDayOfWeek.classList.remove('hidden');
        courseSchedDay.value = String(data.day_of_week ?? 0);
      } else {
        courseFieldDayOfWeek.classList.add('hidden');
      }
    }
    updateCourseRuleSummary();

    if (courseStatCadenceBadge && courseStatCadenceDetail) {
      if (data.enabled) {
        courseStatCadenceBadge.innerText = type === 'weekly' ? `Weekly (${dayNames[data.day_of_week ?? 0]})` : 'Daily Active';
        courseStatCadenceBadge.className = 'text-sm font-bold text-indigo-600';
        courseStatCadenceDetail.innerText = `Trigger: ${String(data.hour ?? 3).padStart(2, '0')}:00 WIB`;
      } else {
        courseStatCadenceBadge.innerText = 'Disabled';
        courseStatCadenceBadge.className = 'text-sm font-bold text-gray-500';
        courseStatCadenceDetail.innerText = 'Manual dispatch only';
      }
    }

    if (courseStatLastTime) courseStatLastTime.innerText = formatTime(data.last_run_at);

    if (courseStatStatusDot && courseStatStatusText) {
      if (data.last_status === 'success') {
        courseStatStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        courseStatStatusText.innerText = 'SUCCESS';
        courseStatStatusText.className = 'text-sm font-bold text-emerald-600';
      } else if (data.last_status === 'failed') {
        courseStatStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
        courseStatStatusText.innerText = 'FAILED';
        courseStatStatusText.className = 'text-sm font-bold text-rose-600';
      } else if (data.last_status === 'BACKEND_NOT_DEPLOYED') {
        if (courseStatCadenceBadge) {
          courseStatCadenceBadge.innerText = 'Deploy Pending';
          courseStatCadenceBadge.className = 'text-sm font-bold text-amber-600';
        }
        courseStatStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
        courseStatStatusText.innerText = 'NOT DEPLOYED';
      } else {
        courseStatStatusDot.className = 'w-2 h-2 rounded-full bg-gray-400';
        courseStatStatusText.innerText = data.last_status || 'IDLE';
        courseStatStatusText.className = 'text-sm font-bold text-gray-700';
      }
    }

    // Live count from PostgreSQL table course_catalog
    try {
      const summaryRes = await fetch('/api/courses/summary');
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        const activeCount = summaryData.active ?? summaryData.total ?? 0;
        if (courseStatCount) courseStatCount.innerText = Number(activeCount).toLocaleString('id-ID');
      } else if (courseStatCount) {
        courseStatCount.innerText = '0';
      }
    } catch {
      if (courseStatCount) courseStatCount.innerText = '0';
    }

    if (courseLedgerRows) {
      if (data.last_result) {
        const updated = data.last_result.courses_updated ?? data.last_result.updated ?? 0;
        const deleted = data.last_result.courses_deleted ?? data.last_result.deleted ?? 0;

        courseLedgerRows.innerHTML = `
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="py-2.5 px-2.5 text-gray-900 tabular-nums">${formatTime(data.last_run_at)}</td>
            <td class="py-2.5 px-2.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                data.last_status === 'success' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }">
                ${(data.last_status || 'UNKNOWN').toUpperCase()}
              </span>
            </td>
            <td class="py-2.5 px-2.5 tabular-nums text-gray-900 font-bold">${updated.toLocaleString('id-ID')}</td>
            <td class="py-2.5 px-2.5 tabular-nums text-gray-600">${deleted.toLocaleString('id-ID')}</td>
            <td class="py-2.5 px-2.5 text-right">
              <span class="text-gray-400 text-[10px]">Verified Catalog</span>
            </td>
          </tr>
        `;
      } else {
        courseLedgerRows.innerHTML = `<tr><td colspan="5" class="py-5 text-center text-gray-400 font-sans text-xs">No previous execution recorded.</td></tr>`;
      }
    }
  } catch (err) {
    console.error('Failed to load course telemetry:', err);
  }
}

// =========================================================================
// 2. RULE SUMMARIES
// =========================================================================

function updateRuleSummary() {
  const schedEnabled = document.getElementById('sched-enabled') as HTMLInputElement | null;
  const schedHour = document.getElementById('sched-hour') as HTMLSelectElement | null;
  const schedDay = document.getElementById('sched-day') as HTMLSelectElement | null;
  const ruleSummary = document.getElementById('rule-summary');
  const schedBody = document.getElementById('sched-body');
  const btnSave = document.getElementById('btn-save-schedule') as HTMLButtonElement | null;

  if (!schedEnabled || !schedHour || !schedDay || !ruleSummary) return;

  const enabled = schedEnabled.checked;
  const type = document.querySelector<HTMLInputElement>('input[name="schedule_type"]:checked')?.value || 'daily';
  const hour = schedHour.value.padStart(2, '0');
  const day = dayNames[parseInt(schedDay.value, 10)] || 'Sunday';

  if (schedBody) {
    schedBody.className = enabled
      ? 'space-y-5 transition-all duration-200 opacity-100 pointer-events-auto'
      : 'space-y-5 transition-all duration-200 opacity-40 pointer-events-none';
  }
  if (btnSave) btnSave.disabled = !enabled;

  if (!enabled) {
    ruleSummary.innerText = 'Inactive (Manual Trigger Only)';
    ruleSummary.className = 'text-gray-500 font-medium text-xs';
  } else if (type === 'daily') {
    ruleSummary.innerText = `Run daily at ${hour}:00 WIB`;
    ruleSummary.className = 'text-emerald-600 font-bold text-xs';
  } else {
    ruleSummary.innerText = `Run weekly on ${day} at ${hour}:00 WIB`;
    ruleSummary.className = 'text-emerald-600 font-bold text-xs';
  }
}

function updateHistoryRuleSummary() {
  const historySchedEnabled = document.getElementById('history-sched-enabled') as HTMLInputElement | null;
  const historySchedHour = document.getElementById('history-sched-hour') as HTMLSelectElement | null;
  const historySchedDay = document.getElementById('history-sched-day') as HTMLSelectElement | null;
  const historyRuleSummary = document.getElementById('history-rule-summary');
  const histBody = document.getElementById('history-sched-body');
  const btnHistSave = document.getElementById('btn-save-history-schedule') as HTMLButtonElement | null;

  if (!historySchedEnabled || !historySchedHour || !historySchedDay || !historyRuleSummary) return;

  const enabled = historySchedEnabled.checked;
  const type = document.querySelector<HTMLInputElement>('input[name="history_schedule_type"]:checked')?.value || 'daily';
  const hour = historySchedHour.value.padStart(2, '0');
  const day = dayNames[parseInt(historySchedDay.value, 10)] || 'Sunday';

  if (histBody) {
    histBody.className = enabled
      ? 'space-y-5 transition-all duration-200 opacity-100 pointer-events-auto'
      : 'space-y-5 transition-all duration-200 opacity-40 pointer-events-none';
  }
  if (btnHistSave) btnHistSave.disabled = !enabled;

  if (!enabled) {
    historyRuleSummary.innerText = 'Inactive (Manual Trigger Only)';
    historyRuleSummary.className = 'text-gray-500 font-medium text-xs';
  } else if (type === 'daily') {
    historyRuleSummary.innerText = `Run daily at ${hour}:00 WIB`;
    historyRuleSummary.className = 'text-emerald-600 font-bold text-xs';
  } else {
    historyRuleSummary.innerText = `Run weekly on ${day} at ${hour}:00 WIB`;
    historyRuleSummary.className = 'text-emerald-600 font-bold text-xs';
  }
}

function updateCourseRuleSummary() {
  const courseSchedEnabled = document.getElementById('course-sched-enabled') as HTMLInputElement | null;
  const courseSchedHour = document.getElementById('course-sched-hour') as HTMLSelectElement | null;
  const courseSchedDay = document.getElementById('course-sched-day') as HTMLSelectElement | null;
  const courseRuleSummary = document.getElementById('course-rule-summary');
  const courseBody = document.getElementById('course-sched-body');
  const btnCourseSave = document.getElementById('btn-save-course-schedule') as HTMLButtonElement | null;

  if (!courseSchedEnabled || !courseSchedHour || !courseSchedDay || !courseRuleSummary) return;

  const enabled = courseSchedEnabled.checked;
  const type = document.querySelector<HTMLInputElement>('input[name="course_schedule_type"]:checked')?.value || 'daily';
  const hour = courseSchedHour.value.padStart(2, '0');
  const day = dayNames[parseInt(courseSchedDay.value, 10)] || 'Sunday';

  if (courseBody) {
    courseBody.className = enabled
      ? 'space-y-5 transition-all duration-200 opacity-100 pointer-events-auto'
      : 'space-y-5 transition-all duration-200 opacity-40 pointer-events-none';
  }
  if (btnCourseSave) btnCourseSave.disabled = !enabled;

  if (!enabled) {
    courseRuleSummary.innerText = 'Inactive (Manual Trigger Only)';
    courseRuleSummary.className = 'text-gray-500 font-medium text-xs';
  } else if (type === 'daily') {
    courseRuleSummary.innerText = `Run daily at ${hour}:00 WIB`;
    courseRuleSummary.className = 'text-indigo-600 font-bold text-xs';
  } else {
    courseRuleSummary.innerText = `Run weekly on ${day} at ${hour}:00 WIB`;
    courseRuleSummary.className = 'text-indigo-600 font-bold text-xs';
  }
}

// =========================================================================
// 3. PIPELINE DISPATCHERS
// =========================================================================

export async function startPipeline() {
  const btnSync = document.getElementById('btn-trigger-sync') as HTMLButtonElement | null;
  const syncSpinner = document.getElementById('sync-spinner');
  const syncBtnLabel = document.getElementById('sync-btn-label');
  const monitor = document.getElementById('sync-monitor-card');
  const monitorState = document.getElementById('monitor-state');
  const monitorPulse = document.getElementById('monitor-pulse');
  const monitorBar = document.getElementById('monitor-bar') as HTMLElement | null;
  const monitorPct = document.getElementById('monitor-pct');
  const monitorJobId = document.getElementById('monitor-job-id');
  const monitorStage = document.getElementById('monitor-stage-text');
  const monitorTimer = document.getElementById('monitor-timer');
  const monitorDetails = document.getElementById('monitor-details');

  if (!btnSync || btnSync.disabled) return;
  btnSync.disabled = true;
  if (syncBtnLabel) syncBtnLabel.innerText = 'Syncing...';
  if (syncSpinner) syncSpinner.classList.add('animate-spin');

  if (monitor) monitor.classList.remove('hidden');
  if (monitorState) {
    monitorState.innerText = 'DISPATCHING';
    monitorState.className = 'text-[11px] font-bold text-amber-600 tracking-wide uppercase';
  }
  if (monitorPulse) monitorPulse.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
  if (monitorBar) {
    monitorBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-500 ease-out';
    monitorBar.style.width = '15%';
  }
  if (monitorPct) {
    monitorPct.innerText = '15%';
    monitorPct.className = 'text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded tabular-nums';
  }
  if (monitorJobId) monitorJobId.innerText = 'Connecting to worker...';
  if (monitorStage) monitorStage.innerText = 'Stage 1/4: Task Enqueue & Worker Dispatch';
  if (monitorDetails) {
    monitorDetails.classList.add('hidden');
    monitorDetails.innerHTML = '';
  }

  let seconds = 0;
  let targetPct = 20;
  let currentPct = 15;

  const timerInterval = setInterval(() => {
    seconds++;
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    if (monitorTimer) monitorTimer.innerText = `${mins}:${secs}s`;

    if (currentPct < targetPct) {
      currentPct += 1;
      if (monitorBar) monitorBar.style.width = `${currentPct}%`;
      if (monitorPct) monitorPct.innerText = `${currentPct}%`;
    } else if (currentPct < 92 && targetPct < 95) {
      currentPct += 0.5;
      const display = Math.floor(currentPct);
      if (monitorBar) monitorBar.style.width = `${display}%`;
      if (monitorPct) monitorPct.innerText = `${display}%`;
    }
  }, 500);

  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || 'API dispatch rejected');
    }
    const data = await res.json();
    const jobId = data.job_id;
    if (!jobId) throw new Error('Missing job ticket ID');

    if (monitorJobId) monitorJobId.innerText = `Ticket: ${jobId}`;
    if (monitorState) {
      monitorState.innerText = 'RUNNING';
      monitorState.className = 'text-[11px] font-bold text-emerald-600 tracking-wide uppercase';
    }
    if (monitorPulse) monitorPulse.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-ping';
    if (monitorBar) monitorBar.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out';
    if (monitorPct) monitorPct.className = 'text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums';

    targetPct = 45;
    if (monitorStage) monitorStage.innerText = 'Stage 2/4: Fetching Google Spreadsheet records...';
    if (syncBtnLabel) syncBtnLabel.innerText = 'Processing...';

    let pollCount = 0;
    const poll = setInterval(async () => {
      pollCount++;
      if (pollCount === 3) {
        targetPct = 70;
        if (monitorStage) monitorStage.innerText = 'Stage 3/4: Ingesting & normalizing into PostgreSQL...';
      }
      if (pollCount === 7) {
        targetPct = 88;
        if (monitorStage) monitorStage.innerText = 'Stage 4/4: Finalizing batch transaction...';
      }

      try {
        const pollRes = await fetch(`/api/status/${jobId}`);
        if (!pollRes.ok) return;
        const pollData = await pollRes.json();
        const status = pollData.status;

        if (status === 'done' || status === 'finished') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnSync) btnSync.disabled = false;
          if (syncSpinner) syncSpinner.classList.remove('animate-spin');
          if (syncBtnLabel) syncBtnLabel.innerText = 'Sync Now';

          const r = pollData.result || {};
          if (r.status === 'failed') {
            if (monitorState) {
              monitorState.innerText = 'FAILED';
              monitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
            }
            if (monitorPulse) monitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
            if (monitorBar) {
              monitorBar.className = 'h-full rounded-full bg-rose-600 transition-all duration-300';
              monitorBar.style.width = '100%';
            }
            if (monitorPct) {
              monitorPct.innerText = 'ERR';
              monitorPct.className = 'text-[10px] font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded';
            }
            if (monitorDetails) {
              monitorDetails.classList.remove('hidden');
              monitorDetails.innerText = `Error: ${r.error || r.message || 'Worker task aborted'}`;
            }
            notify('Spreadsheet sync failed', false);
          } else {
            if (monitorState) {
              monitorState.innerText = 'SUCCESS';
              monitorState.className = 'text-[11px] font-bold text-emerald-600 tracking-wide uppercase';
            }
            if (monitorPulse) monitorPulse.className = 'w-2 h-2 rounded-full bg-emerald-500';
            if (monitorBar) {
              monitorBar.className = 'h-full rounded-full bg-emerald-500 transition-all duration-300';
              monitorBar.style.width = '100%';
            }
            if (monitorPct) {
              monitorPct.innerText = '100%';
              monitorPct.className = 'text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums';
            }
            if (monitorStage) monitorStage.innerText = 'Complete: Pipeline synchronized & verified';
            if (monitorDetails) {
              monitorDetails.classList.remove('hidden');
              const u = r.users_updated ?? 0;
              const b = r.branches_updated ?? 0;
              monitorDetails.innerHTML = `
                <div class="flex items-center gap-4 text-xs font-mono pt-1 text-gray-700">
                  <div>Users Staged: <span class="text-emerald-700 font-bold">${u.toLocaleString('id-ID')}</span></div>
                  <div>Branches: <span class="text-emerald-700 font-bold">${b.toLocaleString('id-ID')}</span></div>
                  <div class="text-emerald-600 font-semibold">✓ Postgres Live</div>
                </div>
              `;
            }
            notify('Spreadsheet sync pipeline complete!');
            loadEmployeeTelemetry();
          }
        } else if (status === 'failed') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnSync) btnSync.disabled = false;
          if (syncSpinner) syncSpinner.classList.remove('animate-spin');
          if (syncBtnLabel) syncBtnLabel.innerText = 'Sync Now';
          if (monitorState) {
            monitorState.innerText = 'FAILED';
            monitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
          }
          if (monitorPulse) monitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
          if (monitorBar) {
            monitorBar.className = 'h-full rounded-full bg-rose-600';
            monitorBar.style.width = '100%';
          }
          notify('Worker reported failure', false);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);

  } catch (err: any) {
    clearInterval(timerInterval);
    if (btnSync) btnSync.disabled = false;
    if (syncSpinner) syncSpinner.classList.remove('animate-spin');
    if (syncBtnLabel) syncBtnLabel.innerText = 'Sync Now';
    if (monitorState) {
      monitorState.innerText = 'DISPATCH ERROR';
      monitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
    }
    if (monitorPulse) monitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
    if (monitorDetails) {
      monitorDetails.classList.remove('hidden');
      monitorDetails.innerText = err.message || 'Dispatch error occurred';
    }
    notify(err.message || 'Dispatch error', false);
  }
}

export async function startHistoryPipeline() {
  const btnHistorySync = document.getElementById('btn-trigger-history-sync') as HTMLButtonElement | null;
  const historySyncSpinner = document.getElementById('history-sync-spinner');
  const historySyncBtnLabel = document.getElementById('history-sync-btn-label');
  const historyMonitor = document.getElementById('history-sync-monitor-card');
  const historyMonitorState = document.getElementById('history-monitor-state');
  const historyMonitorPulse = document.getElementById('history-monitor-pulse');
  const historyMonitorBar = document.getElementById('history-monitor-bar') as HTMLElement | null;
  const historyMonitorPct = document.getElementById('history-monitor-pct');
  const historyMonitorJobId = document.getElementById('history-monitor-job-id');
  const historyMonitorStage = document.getElementById('history-monitor-stage-text');
  const historyMonitorTimer = document.getElementById('history-monitor-timer');
  const historyMonitorDetails = document.getElementById('history-monitor-details');

  if (!btnHistorySync || btnHistorySync.disabled) return;
  btnHistorySync.disabled = true;
  if (historySyncBtnLabel) historySyncBtnLabel.innerText = 'Syncing...';
  if (historySyncSpinner) historySyncSpinner.classList.add('animate-spin');

  if (historyMonitor) historyMonitor.classList.remove('hidden');
  if (historyMonitorState) {
    historyMonitorState.innerText = 'DISPATCHING';
    historyMonitorState.className = 'text-[11px] font-bold text-amber-600 tracking-wide uppercase';
  }
  if (historyMonitorPulse) historyMonitorPulse.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
  if (historyMonitorBar) {
    historyMonitorBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-500 ease-out';
    historyMonitorBar.style.width = '15%';
  }
  if (historyMonitorPct) {
    historyMonitorPct.innerText = '15%';
    historyMonitorPct.className = 'text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded tabular-nums';
  }
  if (historyMonitorJobId) historyMonitorJobId.innerText = 'Connecting to worker...';
  if (historyMonitorStage) historyMonitorStage.innerText = 'Stage 1/4: Task Enqueue & Worker Dispatch';
  if (historyMonitorDetails) {
    historyMonitorDetails.classList.add('hidden');
    historyMonitorDetails.innerHTML = '';
  }

  let seconds = 0;
  let targetPct = 20;
  let currentPct = 15;

  const timerInterval = setInterval(() => {
    seconds++;
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    if (historyMonitorTimer) historyMonitorTimer.innerText = `${mins}:${secs}s`;

    if (currentPct < targetPct) {
      currentPct += 1;
      if (historyMonitorBar) historyMonitorBar.style.width = `${currentPct}%`;
      if (historyMonitorPct) historyMonitorPct.innerText = `${currentPct}%`;
    } else if (currentPct < 92 && targetPct < 95) {
      currentPct += 0.5;
      const display = Math.floor(currentPct);
      if (historyMonitorBar) historyMonitorBar.style.width = `${display}%`;
      if (historyMonitorPct) historyMonitorPct.innerText = `${display}%`;
    }
  }, 500);

  try {
    const res = await fetch('/api/history/sync', { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || 'API dispatch rejected');
    }
    const data = await res.json();
    const jobId = data.job_id;
    if (!jobId) throw new Error('Missing job ticket ID');

    if (historyMonitorJobId) historyMonitorJobId.innerText = `Ticket: ${jobId}`;
    if (historyMonitorState) {
      historyMonitorState.innerText = 'RUNNING';
      historyMonitorState.className = 'text-[11px] font-bold text-emerald-600 tracking-wide uppercase';
    }
    if (historyMonitorPulse) historyMonitorPulse.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-ping';
    if (historyMonitorBar) historyMonitorBar.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out';
    if (historyMonitorPct) historyMonitorPct.className = 'text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums';

    targetPct = 45;
    if (historyMonitorStage) historyMonitorStage.innerText = 'Stage 2/4: Fetching Google Spreadsheet score_trend records...';
    if (historySyncBtnLabel) historySyncBtnLabel.innerText = 'Processing...';

    let pollCount = 0;
    const poll = setInterval(async () => {
      pollCount++;
      if (pollCount === 3) {
        targetPct = 70;
        if (historyMonitorStage) historyMonitorStage.innerText = 'Stage 3/4: Ingesting & normalizing into PostgreSQL user_kpi_history...';
      }
      if (pollCount === 7) {
        targetPct = 88;
        if (historyMonitorStage) historyMonitorStage.innerText = 'Stage 4/4: Finalizing batch transaction...';
      }

      try {
        const pollRes = await fetch(`/api/history/status/${jobId}`);
        if (!pollRes.ok) return;
        const pollData = await pollRes.json();
        const status = pollData.status;

        if (status === 'done' || status === 'finished') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnHistorySync) btnHistorySync.disabled = false;
          if (historySyncSpinner) historySyncSpinner.classList.remove('animate-spin');
          if (historySyncBtnLabel) historySyncBtnLabel.innerText = 'Sync Now';

          const r = pollData.result || {};
          if (r.status === 'failed') {
            if (historyMonitorState) {
              historyMonitorState.innerText = 'FAILED';
              historyMonitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
            }
            if (historyMonitorPulse) historyMonitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
            if (historyMonitorBar) {
              historyMonitorBar.className = 'h-full rounded-full bg-rose-600 transition-all duration-300';
              historyMonitorBar.style.width = '100%';
            }
            if (historyMonitorPct) {
              historyMonitorPct.innerText = 'ERR';
              historyMonitorPct.className = 'text-[10px] font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded';
            }
            if (historyMonitorDetails) {
              historyMonitorDetails.classList.remove('hidden');
              historyMonitorDetails.innerText = `Error: ${r.error || r.message || 'Worker task aborted'}`;
            }
            notify('KPI history sync failed', false);
          } else {
            if (historyMonitorState) {
              historyMonitorState.innerText = 'SUCCESS';
              historyMonitorState.className = 'text-[11px] font-bold text-emerald-600 tracking-wide uppercase';
            }
            if (historyMonitorPulse) historyMonitorPulse.className = 'w-2 h-2 rounded-full bg-emerald-500';
            if (historyMonitorBar) {
              historyMonitorBar.className = 'h-full rounded-full bg-emerald-500 transition-all duration-300';
              historyMonitorBar.style.width = '100%';
            }
            if (historyMonitorPct) {
              historyMonitorPct.innerText = '100%';
              historyMonitorPct.className = 'text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded';
            }
            if (historyMonitorStage) {
              historyMonitorStage.innerText = `Ingested ${(r.history_updated || 0).toLocaleString('id-ID')} KPI history records`;
            }
            const lastRunMeta = {
              last_run_at: new Date().toISOString(),
              last_status: 'success',
              last_result: r,
            };
            try {
              localStorage.setItem('cag:history:last_run', JSON.stringify(lastRunMeta));
            } catch {}

            fetch('/api/history/schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(lastRunMeta),
            }).catch(() => {});

            notify(`KPI history sync complete: ${(r.history_updated || 0).toLocaleString('id-ID')} records staged.`);
            loadHistoryTelemetry();
          }
        } else if (status === 'failed') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnHistorySync) btnHistorySync.disabled = false;
          if (historySyncSpinner) historySyncSpinner.classList.remove('animate-spin');
          if (historySyncBtnLabel) historySyncBtnLabel.innerText = 'Sync Now';
          if (historyMonitorState) {
            historyMonitorState.innerText = 'FAILED';
            historyMonitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
          }
          if (historyMonitorPulse) historyMonitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
          if (historyMonitorBar) {
            historyMonitorBar.className = 'h-full rounded-full bg-rose-600';
            historyMonitorBar.style.width = '100%';
          }
          notify('Worker reported failure', false);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);

  } catch (err: any) {
    clearInterval(timerInterval);
    if (btnHistorySync) btnHistorySync.disabled = false;
    if (historySyncSpinner) historySyncSpinner.classList.remove('animate-spin');
    if (historySyncBtnLabel) historySyncBtnLabel.innerText = 'Sync Now';
    if (historyMonitorState) {
      historyMonitorState.innerText = 'DISPATCH ERROR';
      historyMonitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
    }
    if (historyMonitorPulse) historyMonitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
    if (historyMonitorDetails) {
      historyMonitorDetails.classList.remove('hidden');
      historyMonitorDetails.innerText = err.message || 'Dispatch error occurred';
    }
    notify(err.message || 'Dispatch error', false);
  }
}

export async function startCoursePipeline() {
  const btnCourseSync = document.getElementById('btn-trigger-course-sync') as HTMLButtonElement | null;
  const courseSyncSpinner = document.getElementById('course-sync-spinner');
  const courseSyncBtnLabel = document.getElementById('course-sync-btn-label');
  const courseMonitor = document.getElementById('course-sync-monitor-card');
  const courseMonitorState = document.getElementById('course-monitor-state');
  const courseMonitorPulse = document.getElementById('course-monitor-pulse');
  const courseMonitorBar = document.getElementById('course-monitor-bar') as HTMLElement | null;
  const courseMonitorPct = document.getElementById('course-monitor-pct');
  const courseMonitorJobId = document.getElementById('course-monitor-job-id');
  const courseMonitorStage = document.getElementById('course-monitor-stage-text');
  const courseMonitorTimer = document.getElementById('course-monitor-timer');
  const courseMonitorDetails = document.getElementById('course-monitor-details');

  if (!btnCourseSync || btnCourseSync.disabled) return;
  btnCourseSync.disabled = true;
  if (courseSyncBtnLabel) courseSyncBtnLabel.innerText = 'Syncing Courses...';
  if (courseSyncSpinner) courseSyncSpinner.classList.add('animate-spin');

  if (courseMonitor) courseMonitor.classList.remove('hidden');
  if (courseMonitorState) {
    courseMonitorState.innerText = 'DISPATCHING';
    courseMonitorState.className = 'text-[11px] font-bold text-amber-600 tracking-wide uppercase';
  }
  if (courseMonitorPulse) courseMonitorPulse.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
  if (courseMonitorBar) {
    courseMonitorBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-500 ease-out';
    courseMonitorBar.style.width = '15%';
  }
  if (courseMonitorPct) {
    courseMonitorPct.innerText = '15%';
    courseMonitorPct.className = 'text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded tabular-nums';
  }
  if (courseMonitorJobId) courseMonitorJobId.innerText = 'Connecting to worker...';
  if (courseMonitorStage) courseMonitorStage.innerText = 'Stage 1/3: Task Enqueue & Worker Dispatch';
  if (courseMonitorDetails) {
    courseMonitorDetails.classList.add('hidden');
    courseMonitorDetails.innerHTML = '';
  }

  let seconds = 0;
  let targetPct = 25;
  let currentPct = 15;

  const timerInterval = setInterval(() => {
    seconds++;
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    if (courseMonitorTimer) courseMonitorTimer.innerText = `${mins}:${secs}s`;

    if (currentPct < targetPct) {
      currentPct += 1.5;
      if (courseMonitorBar) courseMonitorBar.style.width = `${currentPct}%`;
      if (courseMonitorPct) courseMonitorPct.innerText = `${Math.floor(currentPct)}%`;
    } else if (currentPct < 90 && targetPct < 95) {
      currentPct += 0.8;
      const display = Math.floor(currentPct);
      if (courseMonitorBar) courseMonitorBar.style.width = `${display}%`;
      if (courseMonitorPct) courseMonitorPct.innerText = `${display}%`;
    }
  }, 400);

  try {
    const res = await fetch('/api/courses/sync', { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || 'Course sync dispatch rejected');
    }
    const data = await res.json();
    const jobId = data.job_id;
    if (!jobId) throw new Error('Missing job ticket ID');

    if (courseMonitorJobId) courseMonitorJobId.innerText = `Ticket: ${jobId}`;
    if (courseMonitorState) {
      courseMonitorState.innerText = 'RUNNING';
      courseMonitorState.className = 'text-[11px] font-bold text-indigo-600 tracking-wide uppercase';
    }
    if (courseMonitorPulse) courseMonitorPulse.className = 'w-2 h-2 rounded-full bg-indigo-500 animate-ping';
    if (courseMonitorBar) courseMonitorBar.className = 'h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out';
    if (courseMonitorPct) courseMonitorPct.className = 'text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded tabular-nums';

    targetPct = 60;
    if (courseMonitorStage) courseMonitorStage.innerText = 'Stage 2/3: Fetching and parsing active catalog...';
    if (courseSyncBtnLabel) courseSyncBtnLabel.innerText = 'Processing...';

    let pollCount = 0;
    const poll = setInterval(async () => {
      pollCount++;
      if (pollCount === 2) {
        targetPct = 85;
        if (courseMonitorStage) courseMonitorStage.innerText = 'Stage 3/3: Staging active courses & pruning orphans...';
      }

      try {
        const pollRes = await fetch(`/api/courses/status/${jobId}`);
        if (!pollRes.ok) return;
        const pollData = await pollRes.json();
        const status = pollData.status;

        if (status === 'done' || status === 'finished') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnCourseSync) btnCourseSync.disabled = false;
          if (courseSyncSpinner) courseSyncSpinner.classList.remove('animate-spin');
          if (courseSyncBtnLabel) courseSyncBtnLabel.innerText = 'Sync Now';

          const r = pollData.result || {};
          if (r.status === 'failed') {
            if (courseMonitorState) {
              courseMonitorState.innerText = 'FAILED';
              courseMonitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
            }
            if (courseMonitorPulse) courseMonitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
            if (courseMonitorBar) {
              courseMonitorBar.className = 'h-full rounded-full bg-rose-600 transition-all duration-300';
              courseMonitorBar.style.width = '100%';
            }
            if (courseMonitorPct) {
              courseMonitorPct.innerText = 'ERR';
              courseMonitorPct.className = 'text-[10px] font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded';
            }
            if (courseMonitorDetails) {
              courseMonitorDetails.classList.remove('hidden');
              courseMonitorDetails.innerText = `Error: ${r.error || r.message || 'Worker task aborted'}`;
            }
            notify('Course sync failed', false);
          } else {
            if (courseMonitorState) {
              courseMonitorState.innerText = 'SUCCESS';
              courseMonitorState.className = 'text-[11px] font-bold text-indigo-600 tracking-wide uppercase';
            }
            if (courseMonitorPulse) courseMonitorPulse.className = 'w-2 h-2 rounded-full bg-indigo-500';
            if (courseMonitorBar) {
              courseMonitorBar.className = 'h-full rounded-full bg-indigo-500 transition-all duration-300';
              courseMonitorBar.style.width = '100%';
            }
            if (courseMonitorPct) {
              courseMonitorPct.innerText = '100%';
              courseMonitorPct.className = 'text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded tabular-nums';
            }
            if (courseMonitorStage) courseMonitorStage.innerText = 'Complete: Course catalog synchronized & verified';
            if (courseMonitorDetails) {
              courseMonitorDetails.classList.remove('hidden');
              const u = r.courses_updated ?? r.updated ?? 0;
              const d = r.courses_deleted ?? r.deleted ?? 0;
              courseMonitorDetails.innerHTML = `
                <div class="flex items-center gap-4 text-xs font-mono pt-1 text-gray-700">
                  <div>Active Courses: <span class="text-indigo-700 font-bold">${u.toLocaleString('id-ID')}</span></div>
                  <div>Pruned: <span class="text-gray-600 font-bold">${d.toLocaleString('id-ID')}</span></div>
                  <div class="text-indigo-600 font-semibold">✓ Postgres Live</div>
                </div>
              `;
            }
            notify('Course catalog sync complete!');
            loadCourseTelemetry();
          }
        } else if (status === 'failed') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnCourseSync) btnCourseSync.disabled = false;
          if (courseSyncSpinner) courseSyncSpinner.classList.remove('animate-spin');
          if (courseSyncBtnLabel) courseSyncBtnLabel.innerText = 'Sync Now';
          if (courseMonitorState) {
            courseMonitorState.innerText = 'FAILED';
            courseMonitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
          }
          if (courseMonitorPulse) courseMonitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
          if (courseMonitorBar) {
            courseMonitorBar.className = 'h-full rounded-full bg-rose-600';
            courseMonitorBar.style.width = '100%';
          }
          notify('Course sync worker reported failure', false);
        }
      } catch (e) {
        console.error('Course polling error:', e);
      }
    }, 2000);

  } catch (err: any) {
    clearInterval(timerInterval);
    if (btnCourseSync) btnCourseSync.disabled = false;
    if (courseSyncSpinner) courseSyncSpinner.classList.remove('animate-spin');
    if (courseSyncBtnLabel) courseSyncBtnLabel.innerText = 'Sync Now';
    if (courseMonitorState) {
      courseMonitorState.innerText = 'DISPATCH ERROR';
      courseMonitorState.className = 'text-[11px] font-bold text-rose-600 tracking-wide uppercase';
    }
    if (courseMonitorPulse) courseMonitorPulse.className = 'w-2 h-2 rounded-full bg-rose-500';
    if (courseMonitorDetails) {
      courseMonitorDetails.classList.remove('hidden');
      courseMonitorDetails.innerText = err.message || 'Course dispatch error occurred';
    }
    notify(err.message || 'Course dispatch error', false);
  }
}

// =========================================================================
// 4. TAB INITIALIZER
// =========================================================================

export function initSyncTab() {
  // 0. Sub-Tabs Navigation (Sync Employee | Sync Course)
  const syncSubtabBtns = document.querySelectorAll<HTMLButtonElement>('.sync-subtab-btn');
  const syncSubtabPanes = document.querySelectorAll<HTMLElement>('.sync-subtab-pane');

  syncSubtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-sync-subtab') || 'employee';

      syncSubtabBtns.forEach(b => {
        b.classList.remove('active', 'text-gray-900', 'bg-white', 'border', 'border-gray-200/80', 'shadow-xs', 'font-bold');
        b.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100', 'font-semibold');
      });
      btn.classList.add('active', 'text-gray-900', 'bg-white', 'border', 'border-gray-200/80', 'shadow-xs', 'font-bold');
      btn.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100', 'font-semibold');

      syncSubtabPanes.forEach(p => p.classList.add('hidden'));
      const targetPane = document.getElementById(`sync-pane-${subtab}`);
      if (targetPane) targetPane.classList.remove('hidden');
    });
  });

  // A. Employee KPI Schedule & Sync
  const formSchedule = document.getElementById('form-schedule');
  const schedEnabled = document.getElementById('sched-enabled');
  const schedHour = document.getElementById('sched-hour');
  const schedDay = document.getElementById('sched-day');
  const fieldDayOfWeek = document.getElementById('field-day-of-week');
  const btnSync = document.getElementById('btn-trigger-sync');

  document.querySelectorAll<HTMLInputElement>('input[name="schedule_type"]').forEach(r => {
    r.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value === 'weekly') {
        fieldDayOfWeek?.classList.remove('hidden');
      } else {
        fieldDayOfWeek?.classList.add('hidden');
      }
      updateRuleSummary();
    });
  });

  if (schedEnabled) schedEnabled.addEventListener('change', updateRuleSummary);
  if (schedHour) schedHour.addEventListener('change', updateRuleSummary);
  if (schedDay) schedDay.addEventListener('change', updateRuleSummary);

  if (formSchedule) {
    formSchedule.addEventListener('submit', async (e) => {
      e.preventDefault();
      const schedEnabledEl = document.getElementById('sched-enabled') as HTMLInputElement | null;
      const schedHourEl = document.getElementById('sched-hour') as HTMLSelectElement | null;
      const schedDayEl = document.getElementById('sched-day') as HTMLSelectElement | null;

      const enabled = schedEnabledEl ? schedEnabledEl.checked : false;
      const schedule_type = document.querySelector<HTMLInputElement>('input[name="schedule_type"]:checked')?.value || 'daily';
      const hour = parseInt(schedHourEl ? schedHourEl.value : '2', 10);
      const day_of_week = parseInt(schedDayEl ? schedDayEl.value : '0', 10);

      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, schedule_type, hour, day_of_week }),
        });
        if (!res.ok) throw new Error('Failed to save employee schedule');
        notify('Employee schedule configuration committed.');
        loadEmployeeTelemetry();
      } catch (err: any) {
        notify(err.message || 'Error saving employee schedule', false);
      }
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', startPipeline);
  }

  // B. Historical KPI Schedule & Sync
  const formHistorySchedule = document.getElementById('form-history-schedule');
  const historySchedEnabled = document.getElementById('history-sched-enabled');
  const historySchedHour = document.getElementById('history-sched-hour');
  const historySchedDay = document.getElementById('history-sched-day');
  const historyFieldDayOfWeek = document.getElementById('history-field-day-of-week');
  const btnHistorySync = document.getElementById('btn-trigger-history-sync');

  document.querySelectorAll<HTMLInputElement>('input[name="history_schedule_type"]').forEach(r => {
    r.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value === 'weekly') {
        historyFieldDayOfWeek?.classList.remove('hidden');
      } else {
        historyFieldDayOfWeek?.classList.add('hidden');
      }
      updateHistoryRuleSummary();
    });
  });

  if (historySchedEnabled) historySchedEnabled.addEventListener('change', updateHistoryRuleSummary);
  if (historySchedHour) historySchedHour.addEventListener('change', updateHistoryRuleSummary);
  if (historySchedDay) historySchedDay.addEventListener('change', updateHistoryRuleSummary);

  if (formHistorySchedule) {
    formHistorySchedule.addEventListener('submit', async (e) => {
      e.preventDefault();
      const historySchedEnabledEl = document.getElementById('history-sched-enabled') as HTMLInputElement | null;
      const historySchedHourEl = document.getElementById('history-sched-hour') as HTMLSelectElement | null;
      const historySchedDayEl = document.getElementById('history-sched-day') as HTMLSelectElement | null;

      const enabled = historySchedEnabledEl ? historySchedEnabledEl.checked : false;
      const schedule_type = document.querySelector<HTMLInputElement>('input[name="history_schedule_type"]:checked')?.value || 'daily';
      const hour = parseInt(historySchedHourEl ? historySchedHourEl.value : '3', 10);
      const day_of_week = parseInt(historySchedDayEl ? historySchedDayEl.value : '0', 10);

      try {
        const res = await fetch('/api/history/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, schedule_type, hour, day_of_week }),
        });
        if (!res.ok) throw new Error('Failed to save KPI history schedule');
        notify('KPI history schedule configuration committed.');
        loadHistoryTelemetry();
      } catch (err: any) {
        notify(err.message || 'Error saving KPI history schedule', false);
      }
    });
  }

  if (btnHistorySync) {
    btnHistorySync.addEventListener('click', startHistoryPipeline);
  }

  // C. Course Catalog Schedule & Sync
  const formCourseSchedule = document.getElementById('form-course-schedule');
  const courseSchedEnabled = document.getElementById('course-sched-enabled');
  const courseSchedHour = document.getElementById('course-sched-hour');
  const courseSchedDay = document.getElementById('course-sched-day');
  const courseFieldDayOfWeek = document.getElementById('course-field-day-of-week');
  const btnCourseSync = document.getElementById('btn-trigger-course-sync');

  document.querySelectorAll<HTMLInputElement>('input[name="course_schedule_type"]').forEach(r => {
    r.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value === 'weekly') {
        courseFieldDayOfWeek?.classList.remove('hidden');
      } else {
        courseFieldDayOfWeek?.classList.add('hidden');
      }
      updateCourseRuleSummary();
    });
  });

  if (courseSchedEnabled) courseSchedEnabled.addEventListener('change', updateCourseRuleSummary);
  if (courseSchedHour) courseSchedHour.addEventListener('change', updateCourseRuleSummary);
  if (courseSchedDay) courseSchedDay.addEventListener('change', updateCourseRuleSummary);

  if (formCourseSchedule) {
    formCourseSchedule.addEventListener('submit', async (e) => {
      e.preventDefault();
      const courseSchedEnabledEl = document.getElementById('course-sched-enabled') as HTMLInputElement | null;
      const courseSchedHourEl = document.getElementById('course-sched-hour') as HTMLSelectElement | null;
      const courseSchedDayEl = document.getElementById('course-sched-day') as HTMLSelectElement | null;

      const enabled = courseSchedEnabledEl ? courseSchedEnabledEl.checked : false;
      const schedule_type = document.querySelector<HTMLInputElement>('input[name="course_schedule_type"]:checked')?.value || 'daily';
      const hour = parseInt(courseSchedHourEl ? courseSchedHourEl.value : '3', 10);
      const day_of_week = parseInt(courseSchedDayEl ? courseSchedDayEl.value : '0', 10);

      try {
        const res = await fetch('/api/courses/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, schedule_type, hour, day_of_week }),
        });
        if (!res.ok) throw new Error('Failed to save course schedule');
        notify('Course catalog schedule configuration committed.');
        loadCourseTelemetry();
      } catch (err: any) {
        notify(err.message || 'Error saving course schedule', false);
      }
    });
  }

  if (btnCourseSync) {
    btnCourseSync.addEventListener('click', startCoursePipeline);
  }
}
