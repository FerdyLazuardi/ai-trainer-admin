// src/scripts/sidebar.ts

export let activeTab = 'sync';

const TAB_META: Record<string, { title: string; subtitle: string }> = {
  sync: {
    title: 'Spreadsheet Sync',
    subtitle: 'Automated synchronization and telemetry management'
  },
  convert: {
    title: 'Convert to Markdown',
    subtitle: 'Extract PPTX/PDF/XLSX and standardize into clean CAG Markdown'
  },
  logs: {
    title: 'Chat Logs & Analytics',
    subtitle: 'Audited turns, intent distribution, and LLM telemetry'
  },
  kpi: {
    title: 'Spreadsheet KPI Directory',
    subtitle: 'Live PostgreSQL user KPI data synced from spreadsheet'
  },
  kb: {
    title: 'Active Knowledge Base',
    subtitle: 'Cached CAG context pack and knowledge repository in PostgreSQL'
  },
  prompts: {
    title: 'System Prompts & Personas',
    subtitle: 'Production LLM instruction sets, modular prompt blocks, and Act-As role specifications'
  }
};

export function closeMobileSidebar() {
  const mainSidebar = document.getElementById('main-sidebar');
  const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');
  const mobileMenuArrow = document.getElementById('mobile-menu-arrow');

  if (!mainSidebar) return;
  mainSidebar.classList.remove('mobile-open');
  if (mobileBackdrop) mobileBackdrop.classList.add('hidden');
  if (mobileMenuArrow) mobileMenuArrow.classList.remove('rotate-180');
  document.body.classList.remove('overflow-hidden', 'lg:overflow-auto');
}

export function openMobileSidebar() {
  const mainSidebar = document.getElementById('main-sidebar');
  const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');
  const mobileMenuArrow = document.getElementById('mobile-menu-arrow');

  if (!mainSidebar) return;
  mainSidebar.classList.add('mobile-open');
  if (mobileBackdrop) mobileBackdrop.classList.remove('hidden');
  if (mobileMenuArrow) mobileMenuArrow.classList.add('rotate-180');
  document.body.classList.add('overflow-hidden', 'lg:overflow-auto');
}

export function initSidebar(onTabChanged?: (newTab: string) => void) {
  const mainSidebar = document.getElementById('main-sidebar');
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
  const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');
  const mobileHeaderTitle = document.getElementById('mobile-header-title');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  // Desktop Collapse State
  const isSidebarCollapsed = localStorage.getItem('cag_sidebar_collapsed') === 'true';
  if (isSidebarCollapsed && mainSidebar && window.innerWidth >= 1024) {
    mainSidebar.classList.add('is-collapsed');
  }

  if (sidebarToggleBtn && mainSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      mainSidebar.classList.toggle('is-collapsed');
      const collapsed = mainSidebar.classList.contains('is-collapsed');
      localStorage.setItem('cag_sidebar_collapsed', String(collapsed));
    });
  }

  // Mobile Drawer Toggle
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      if (mainSidebar && mainSidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }

  if (mobileSidebarClose) {
    mobileSidebarClose.addEventListener('click', closeMobileSidebar);
  }

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', closeMobileSidebar);
  }

  // Tab Switching
  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const tabPanes = document.querySelectorAll<HTMLElement>('.tab-pane');

  let globalTabChangeHandler = onTabChanged;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') || 'sync';
      switchTab(tab);
    });
  });

  (window as any).switchAdminTab = switchTab;
}

export function switchTab(tab: string) {
  if (tab === activeTab) {
    if (window.innerWidth < 1024) closeMobileSidebar();
    return;
  }
  activeTab = tab;

  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const tabPanes = document.querySelectorAll<HTMLElement>('.tab-pane');
  const mobileHeaderTitle = document.getElementById('mobile-header-title');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  tabButtons.forEach(b => {
    const bTab = b.getAttribute('data-tab');
    if (bTab === tab) {
      b.classList.add('active', 'text-gray-900', 'bg-white', 'shadow-xs', 'font-semibold');
      b.classList.remove('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-200/60', 'font-medium');
    } else {
      b.classList.remove('active', 'text-gray-900', 'bg-white', 'shadow-xs', 'font-semibold');
      b.classList.add('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-200/60', 'font-medium');
    }
  });

  tabPanes.forEach(p => p.classList.add('hidden'));
  const activePane = document.getElementById(`tab-content-${tab}`);
  if (activePane) activePane.classList.remove('hidden');

  const meta = TAB_META[tab] || { title: 'Dashboard', subtitle: '' };
  if (mobileHeaderTitle) mobileHeaderTitle.innerText = meta.title;
  if (pageTitle) pageTitle.innerText = meta.title;
  if (pageSubtitle) pageSubtitle.innerText = meta.subtitle;

  if (window.innerWidth < 1024) {
    closeMobileSidebar();
  }

  // Trigger custom event for tab switch
  window.dispatchEvent(new CustomEvent('cag:tab-change', { detail: { tab } }));
}

