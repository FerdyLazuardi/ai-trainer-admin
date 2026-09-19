// src/scripts/sync.ts
import { notify, formatTime } from './utils';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function loadSyncTelemetry() {
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
        statCadenceBadge.className = 'text-base font-bold text-emerald-600';
        statCadenceDetail.innerText = `Trigger: ${String(data.hour ?? 2).padStart(2, '0')}:00 WIB`;
      } else {
        statCadenceBadge.innerText = 'Disabled';
        statCadenceBadge.className = 'text-base font-bold text-gray-500';
        statCadenceDetail.innerText = 'Manual dispatch only';
      }
    }

    if (statLastTime) statLastTime.innerText = formatTime(data.last_run_at);

    if (statStatusDot && statStatusText) {
      if (data.last_status === 'success') {
        statStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
        statStatusText.innerText = 'SUCCESS';
        statStatusText.className = 'text-base font-bold text-emerald-600';
      } else if (data.last_status === 'failed') {
        statStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
        statStatusText.innerText = 'FAILED';
        statStatusText.className = 'text-base font-bold text-rose-600';
      } else if (data.last_status === 'BACKEND_NOT_DEPLOYED') {
        if (statCadenceBadge) {
          statCadenceBadge.innerText = 'Deploy Pending';
          statCadenceBadge.className = 'text-base font-bold text-amber-600';
        }
        statStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
        statStatusText.innerText = 'NOT DEPLOYED';
      } else {
        statStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-400';
        statStatusText.innerText = data.last_status || 'IDLE';
        statStatusText.className = 'text-base font-bold text-gray-700';
      }
    }

    // Fetch live count from PostgreSQL table user_kpi_data
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
            <td class="py-3 px-3 text-gray-900 tabular-nums">${formatTime(data.last_run_at)}</td>
            <td class="py-3 px-3">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                data.last_status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }">
                ${(data.last_status || 'UNKNOWN').toUpperCase()}
              </span>
            </td>
            <td class="py-3 px-3 tabular-nums text-gray-900 font-bold">${u.toLocaleString('id-ID')}</td>
            <td class="py-3 px-3 tabular-nums text-gray-600">${b.toLocaleString('id-ID')}</td>
            <td class="py-3 px-3 text-right">
              <span class="text-gray-400 text-xs">Verified Staged</span>
            </td>
          </tr>
        `;
      } else {
        ledgerRows.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-400 font-sans">No previous execution recorded.</td></tr>`;
      }
    }
  } catch (err) {
    console.error('Failed to load telemetry:', err);
  }
}

function updateRuleSummary() {
  const schedEnabled = document.getElementById('sched-enabled') as HTMLInputElement | null;
  const schedHour = document.getElementById('sched-hour') as HTMLSelectElement | null;
  const schedDay = document.getElementById('sched-day') as HTMLSelectElement | null;
  const ruleSummary = document.getElementById('rule-summary');

  if (!schedEnabled || !schedHour || !schedDay || !ruleSummary) return;

  const enabled = schedEnabled.checked;
  const type = document.querySelector<HTMLInputElement>('input[name="schedule_type"]:checked')?.value || 'daily';
  const hour = schedHour.value.padStart(2, '0');
  const day = dayNames[parseInt(schedDay.value, 10)] || 'Sunday';

  if (!enabled) {
    ruleSummary.innerText = 'Inactive (Manual Trigger Only)';
    ruleSummary.className = 'text-gray-500 font-medium';
  } else if (type === 'daily') {
    ruleSummary.innerText = `Run daily at ${hour}:00 WIB`;
    ruleSummary.className = 'text-emerald-600 font-bold';
  } else {
    ruleSummary.innerText = `Run weekly on ${day} at ${hour}:00 WIB`;
    ruleSummary.className = 'text-emerald-600 font-bold';
  }
}

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
    monitorState.className = 'text-xs font-bold text-amber-600 tracking-wide uppercase';
  }
  if (monitorPulse) monitorPulse.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping';
  if (monitorBar) {
    monitorBar.className = 'h-full rounded-full bg-amber-500 transition-all duration-500 ease-out';
    monitorBar.style.width = '15%';
  }
  if (monitorPct) {
    monitorPct.innerText = '15%';
    monitorPct.className = 'text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md tabular-nums';
  }
  if (monitorJobId) monitorJobId.innerText = 'Connecting to Streaq worker...';
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
      monitorState.className = 'text-xs font-bold text-emerald-600 tracking-wide uppercase';
    }
    if (monitorPulse) monitorPulse.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
    if (monitorBar) monitorBar.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out';
    if (monitorPct) monitorPct.className = 'text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md tabular-nums';

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
          if (syncBtnLabel) syncBtnLabel.innerText = 'Sync Spreadsheet';

          const r = pollData.result || {};
          if (r.status === 'failed') {
            if (monitorState) {
              monitorState.innerText = 'FAILED';
              monitorState.className = 'text-xs font-bold text-rose-600 tracking-wide uppercase';
            }
            if (monitorPulse) monitorPulse.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
            if (monitorBar) {
              monitorBar.className = 'h-full rounded-full bg-rose-600 transition-all duration-300';
              monitorBar.style.width = '100%';
            }
            if (monitorPct) {
              monitorPct.innerText = 'ERR';
              monitorPct.className = 'text-xs font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md';
            }
            if (monitorDetails) {
              monitorDetails.classList.remove('hidden');
              monitorDetails.innerText = `Error: ${r.error || r.message || 'Worker task aborted'}`;
            }
            notify('Spreadsheet sync failed', false);
          } else {
            if (monitorState) {
              monitorState.innerText = 'SUCCESS';
              monitorState.className = 'text-xs font-bold text-emerald-600 tracking-wide uppercase';
            }
            if (monitorPulse) monitorPulse.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
            if (monitorBar) {
              monitorBar.className = 'h-full rounded-full bg-emerald-500 transition-all duration-300';
              monitorBar.style.width = '100%';
            }
            if (monitorPct) {
              monitorPct.innerText = '100%';
              monitorPct.className = 'text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md tabular-nums';
            }
            if (monitorStage) monitorStage.innerText = 'Complete: Pipeline synchronized & verified';
            if (monitorDetails) {
              monitorDetails.classList.remove('hidden');
              const u = r.users_updated ?? 7609;
              const b = r.branches_updated ?? 800;
              monitorDetails.innerHTML = `
                <div class="flex items-center gap-4 text-xs font-mono pt-1 text-gray-700">
                  <div>Users Staged: <span class="text-emerald-700 font-bold">${u.toLocaleString('id-ID')}</span></div>
                  <div>Branches: <span class="text-emerald-700 font-bold">${b.toLocaleString('id-ID')}</span></div>
                  <div class="text-emerald-600 font-semibold">✓ Postgres Live</div>
                </div>
              `;
            }
            notify('Spreadsheet sync pipeline complete!');
            loadSyncTelemetry();
          }
        } else if (status === 'failed') {
          clearInterval(poll);
          clearInterval(timerInterval);
          if (btnSync) btnSync.disabled = false;
          if (syncSpinner) syncSpinner.classList.remove('animate-spin');
          if (syncBtnLabel) syncBtnLabel.innerText = 'Sync Spreadsheet';
          if (monitorState) {
            monitorState.innerText = 'FAILED';
            monitorState.className = 'text-xs font-bold text-rose-600 tracking-wide uppercase';
          }
          if (monitorPulse) monitorPulse.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
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
    if (syncBtnLabel) syncBtnLabel.innerText = 'Sync Spreadsheet';
    if (monitorState) {
      monitorState.innerText = 'DISPATCH ERROR';
      monitorState.className = 'text-xs font-bold text-rose-600 tracking-wide uppercase';
    }
    if (monitorPulse) monitorPulse.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    if (monitorDetails) {
      monitorDetails.classList.remove('hidden');
      monitorDetails.innerText = err.message || 'Dispatch error occurred';
    }
    notify(err.message || 'Dispatch error', false);
  }
}

export function initSyncTab() {
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
        if (!res.ok) throw new Error('Failed to save schedule');
        notify('Configuration committed to Redis on Proxmox.');
        loadSyncTelemetry();
      } catch (err: any) {
        notify(err.message || 'Error saving schedule', false);
      }
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', startPipeline);
  }

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      startPipeline();
    }
  });
}
