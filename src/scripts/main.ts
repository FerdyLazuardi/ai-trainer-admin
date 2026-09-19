// src/scripts/main.ts
import { initClock, initDetailModal, initExchangeRate, notify } from './utils';
import { activeTab, initSidebar, switchTab } from './sidebar';
import { loadSyncTelemetry, initSyncTab } from './sync';
import { initConvertTab } from './convert';
import { rawChatLogs, loadChatLogs, renderChatLogsTable, initLogsTab, lastKPIs } from './logs';
import { rawKPIRows, kpiPage, loadKPIData, initKpiTab } from './kpi';
import { activeKBContent, loadActiveKB, resetActiveKB, initKbTab } from './kb';
import { initPromptsTab, loadSystemPrompts } from './prompts';

function init() {
  // 1. Core Utils & Global UI
  initClock();
  initDetailModal();

  initExchangeRate((rate) => {
    if (lastKPIs) {
      const el = document.getElementById('log-stat-cost');
      if (el) {
        const costIdr = Math.round((lastKPIs.total_cost || 0) * rate);
        el.innerText = `Rp ${costIdr.toLocaleString('id-ID')}`;
      }
      renderChatLogsTable();
    }
  });

  // 2. Sidebar Navigation & Tab Switching
  initSidebar((tab) => {
    if (tab === 'logs' && rawChatLogs.length === 0) {
      loadChatLogs();
    } else if (tab === 'kpi' && rawKPIRows.length === 0) {
      loadKPIData(1);
    } else if (tab === 'kb' && !activeKBContent) {
      loadActiveKB();
    } else if (tab === 'prompts') {
      loadSystemPrompts();
    }
  });

  // 3. Initialize Feature Tabs
  initSyncTab();
  initConvertTab();
  initLogsTab();
  initKpiTab();
  initKbTab();
  initPromptsTab();

  // 4. Quick button from ChatLogs subtab to Prompts
  const btnGotoPrompts = document.getElementById('btn-goto-prompts');
  if (btnGotoPrompts) {
    btnGotoPrompts.addEventListener('click', () => {
      switchTab('prompts');
    });
  }

  // 5. Global Refresh Button
  const btnRefreshAll = document.getElementById('btn-refresh-all');
  if (btnRefreshAll) {
    btnRefreshAll.addEventListener('click', () => {
      if (activeTab === 'sync') loadSyncTelemetry();
      else if (activeTab === 'logs') loadChatLogs();
      else if (activeTab === 'kpi') loadKPIData(kpiPage);
      else if (activeTab === 'kb') loadActiveKB(true);
      else if (activeTab === 'prompts') loadSystemPrompts();
      notify('Refreshed active dataset.');
    });
  }

  // 5. Default View Initial Load
  loadSyncTelemetry();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
