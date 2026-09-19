// src/scripts/prompts.ts
import { notify, escapeHtml } from './utils';

export interface PromptBlock {
  id: string;
  tag: string;
  title: string;
  actAs: string;
  description: string;
  content: string;
}

export interface SystemPromptItem {
  id: string;
  title: string;
  actAs: string;
  category: 'core_generation' | 'memory_summarization' | 'baseline';
  intentTrigger: string;
  description: string;
  pipelineStage: string;
  tokensEst: number;
  openRouterCached: boolean;
  content: string;
  components: string[];
}

let allPrompts: SystemPromptItem[] = [];
let allBlocks: PromptBlock[] = [];
let activeTabId = 'conversational';
let activeBlockId = 'role';
let promptSearchQuery = '';
let dataSource = 'backend_live';

export async function loadSystemPrompts() {
  try {
    const res = await fetch('/api/prompts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.prompts && data.blocks) {
      allPrompts = data.prompts;
      allBlocks = data.blocks;
      dataSource = data.source || 'backend_live';
      updateSourceBadge();
      renderActiveView();
      return;
    }
  } catch (err) {
    console.warn('Failed to load prompts dynamically, fallback triggered:', err);
    dataSource = 'local_fallback';
    updateSourceBadge();
  }
}

function updateSourceBadge() {
  const badge = document.getElementById('prompt-source-badge');
  if (!badge) return;
  if (dataSource === 'backend_live') {
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>backend: live</span>`;
    badge.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-medium inline-flex items-center gap-1';
  } else {
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>local snapshot</span>`;
    badge.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 font-medium inline-flex items-center gap-1';
  }
}

export function initPromptsTab() {
  loadSystemPrompts();

  // Search input
  const searchInput = document.getElementById('prompt-search-input') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      promptSearchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderActiveView();
    });
  }

  // Top prompt tabs
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('[data-prompt-tab]');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-prompt-tab') || 'conversational';
      activeTabId = tabId;

      tabBtns.forEach(b => {
        b.classList.remove('active', 'bg-gray-900', 'text-white');
        b.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
      });

      if (tabId === 'blocks') {
        btn.classList.add('active', 'bg-amber-700', 'text-white');
        btn.classList.remove('text-amber-800', 'bg-amber-50/80', 'hover:bg-amber-100/80');
      } else {
        btn.classList.add('active', 'bg-gray-900', 'text-white');
        btn.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
      }

      // Toggle blocks subnav
      const blocksSubnav = document.getElementById('blocks-subnav-container');
      if (blocksSubnav) {
        if (tabId === 'blocks') {
          blocksSubnav.classList.remove('hidden');
        } else {
          blocksSubnav.classList.add('hidden');
        }
      }

      renderActiveView();
    });
  });

  // Block subnav buttons
  const blockBtns = document.querySelectorAll<HTMLButtonElement>('[data-block-tab]');
  blockBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const bId = btn.getAttribute('data-block-tab') || 'role';
      activeBlockId = bId;

      blockBtns.forEach(b => {
        b.classList.remove('active', 'bg-gray-900', 'text-white');
        b.classList.add('text-gray-600', 'bg-gray-100', 'hover:bg-gray-200');
      });
      btn.classList.add('active', 'bg-gray-900', 'text-white');
      btn.classList.remove('text-gray-600', 'bg-gray-100', 'hover:bg-gray-200');

      renderActiveView();
    });
  });

  // Copy prompt button
  const copyBtn = document.getElementById('btn-copy-prompt');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      let textToCopy = '';
      if (activeTabId === 'blocks') {
        const blk = allBlocks.find(b => b.id === activeBlockId);
        if (blk) textToCopy = blk.content;
      } else {
        const pr = allPrompts.find(p => p.id === activeTabId);
        if (pr) textToCopy = pr.content;
      }

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          notify('Prompt copied to clipboard!');
        }).catch(err => {
          console.error('Clipboard copy failed:', err);
          notify('Failed to copy to clipboard', true);
        });
      }
    });
  }
}

function renderActiveView() {
  const viewerTitle = document.getElementById('min-viewer-title');
  const viewerDesc = document.getElementById('min-viewer-desc');
  const viewerActAs = document.getElementById('min-viewer-act-as');
  const viewerTokens = document.getElementById('min-viewer-tokens');
  const viewerCache = document.getElementById('min-viewer-cache');
  const viewerStage = document.getElementById('min-viewer-stage');
  const viewerTrigger = document.getElementById('min-viewer-trigger');
  const viewerCode = document.getElementById('min-viewer-code');

  if (!viewerCode) return;

  if (activeTabId === 'blocks') {
    const blk = allBlocks.find(b => b.id === activeBlockId) || allBlocks[0];
    if (!blk) return;

    if (viewerTitle) viewerTitle.innerText = `${blk.title} (${blk.tag})`;
    if (viewerDesc) viewerDesc.innerText = blk.description;
    if (viewerActAs) viewerActAs.innerText = blk.actAs;
    if (viewerTokens) viewerTokens.innerText = `~${Math.round(blk.content.length / 4)} tok`;
    if (viewerCache) viewerCache.innerText = 'Byte-stable Prefix';
    if (viewerStage) viewerStage.innerText = 'Modular XML Component';
    if (viewerTrigger) viewerTrigger.innerText = 'Assembled into Conversational & Socratic Prompts';

    viewerCode.textContent = blk.content;
    return;
  }

  const prompt = allPrompts.find(p => p.id === activeTabId) || allPrompts[0];
  if (!prompt) return;

  if (viewerTitle) viewerTitle.innerText = prompt.title;
  if (viewerDesc) viewerDesc.innerText = prompt.description;
  if (viewerActAs) viewerActAs.innerText = prompt.actAs;
  if (viewerTokens) viewerTokens.innerText = `~${prompt.tokensEst} tok`;
  if (viewerCache) viewerCache.innerText = prompt.openRouterCached ? 'Prefix Cacheable' : 'Turn Dynamic';
  if (viewerStage) viewerStage.innerText = prompt.pipelineStage;
  if (viewerTrigger) viewerTrigger.innerText = prompt.intentTrigger;

  viewerCode.textContent = prompt.content;
}
