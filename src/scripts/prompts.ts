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
let activeCategory = 'all';
let activePromptId = 'conversational';
let activeBlockId: string | null = null;
let promptSearchQuery = '';

export async function loadSystemPrompts() {
  try {
    const res = await fetch('/api/prompts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.prompts && data.blocks) {
      allPrompts = data.prompts;
      allBlocks = data.blocks;
      renderPromptsTab();
      return;
    }
  } catch (err) {
    console.warn('Failed to load prompts from API, using fallback data:', err);
  }
}

export function initPromptsTab() {
  loadSystemPrompts();

  // Search input
  const searchInput = document.getElementById('prompt-search-input') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      promptSearchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderPromptList();
    });
  }

  // Category filter pills
  const catButtons = document.querySelectorAll<HTMLButtonElement>('[data-prompt-cat]');
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-prompt-cat') || 'all';
      activeCategory = cat;

      catButtons.forEach(b => {
        b.classList.remove('active', 'bg-gray-900', 'text-white', 'shadow-xs');
        b.classList.add('bg-white', 'text-gray-600', 'hover:bg-gray-100', 'border', 'border-gray-200/80');
      });
      btn.classList.add('active', 'bg-gray-900', 'text-white', 'shadow-xs');
      btn.classList.remove('bg-white', 'text-gray-600', 'hover:bg-gray-100', 'border');

      if (cat === 'blocks') {
        if (allBlocks.length > 0 && !activeBlockId) {
          activeBlockId = allBlocks[0].id;
        }
      } else {
        const filtered = getFilteredPrompts();
        if (filtered.length > 0 && !filtered.some(p => p.id === activePromptId)) {
          activePromptId = filtered[0].id;
        }
      }

      renderPromptsTab();
    });
  });

  // Copy active prompt button
  const copyBtn = document.getElementById('btn-copy-prompt');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      let textToCopy = '';
      if (activeCategory === 'blocks' && activeBlockId) {
        const blk = allBlocks.find(b => b.id === activeBlockId);
        if (blk) textToCopy = blk.content;
      } else {
        const pr = allPrompts.find(p => p.id === activePromptId);
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

function getFilteredPrompts(): SystemPromptItem[] {
  return allPrompts.filter(p => {
    const matchesCat = activeCategory === 'all' || p.category === activeCategory;
    if (!matchesCat) return false;

    if (!promptSearchQuery) return true;
    const q = promptSearchQuery;
    return (
      p.title.toLowerCase().includes(q) ||
      p.actAs.toLowerCase().includes(q) ||
      p.intentTrigger.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q)
    );
  });
}

function getFilteredBlocks(): PromptBlock[] {
  if (!promptSearchQuery) return allBlocks;
  const q = promptSearchQuery;
  return allBlocks.filter(b => 
    b.title.toLowerCase().includes(q) ||
    b.tag.toLowerCase().includes(q) ||
    b.actAs.toLowerCase().includes(q) ||
    b.description.toLowerCase().includes(q) ||
    b.content.toLowerCase().includes(q)
  );
}

export function renderPromptsTab() {
  updateMetricsHeader();
  renderPromptList();
  renderPromptViewer();
}

function updateMetricsHeader() {
  const statPrompts = document.getElementById('stat-total-prompts');
  const statBlocks = document.getElementById('stat-total-blocks');
  const statCache = document.getElementById('stat-prefix-cache');

  if (statPrompts) statPrompts.innerText = String(allPrompts.length);
  if (statBlocks) statBlocks.innerText = String(allBlocks.length);
  if (statCache) statCache.innerText = '100% Ready';
}

function renderPromptList() {
  const listContainer = document.getElementById('prompt-items-list');
  if (!listContainer) return;

  if (activeCategory === 'blocks') {
    const blocks = getFilteredBlocks();
    if (blocks.length === 0) {
      listContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-400">No modular XML blocks found matching "${escapeHtml(promptSearchQuery)}"</div>`;
      return;
    }

    listContainer.innerHTML = blocks.map(b => {
      const isSelected = b.id === activeBlockId;
      return `
        <button
          type="button"
          data-block-id="${b.id}"
          class="prompt-select-btn w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
              : 'bg-white text-gray-800 border-gray-200/80 hover:border-gray-300 hover:bg-gray-50/60'
          }"
        >
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="font-mono text-xs font-bold ${isSelected ? 'text-amber-300' : 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80'}">${escapeHtml(b.tag)}</span>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md ${isSelected ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}">XML Block</span>
          </div>
          <div class="font-bold text-xs ${isSelected ? 'text-white' : 'text-gray-900'} truncate">${escapeHtml(b.title)}</div>
          <div class="text-[11px] ${isSelected ? 'text-gray-300' : 'text-gray-500'} line-clamp-1 mt-1 font-medium">Act As: ${escapeHtml(b.actAs)}</div>
        </button>
      `;
    }).join('');

    listContainer.querySelectorAll<HTMLButtonElement>('[data-block-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeBlockId = btn.getAttribute('data-block-id');
        renderPromptList();
        renderPromptViewer();
      });
    });
    return;
  }

  // Standard prompts
  const prompts = getFilteredPrompts();
  if (prompts.length === 0) {
    listContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-400">No system prompts found matching "${escapeHtml(promptSearchQuery)}"</div>`;
    return;
  }

  listContainer.innerHTML = prompts.map(p => {
    const isSelected = p.id === activePromptId;
    let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200/80';
    if (p.category === 'memory_summarization') badgeColor = 'bg-purple-50 text-purple-700 border-purple-200/80';
    if (p.category === 'baseline') badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';

    return `
      <button
        type="button"
        data-prompt-id="${p.id}"
        class="prompt-select-btn w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
          isSelected
            ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
            : 'bg-white text-gray-800 border-gray-200/80 hover:border-gray-300 hover:bg-gray-50/60'
        }"
      >
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
            isSelected ? 'bg-gray-800 text-gray-300 border-gray-700' : badgeColor
          }">${escapeHtml(p.category.replace('_', ' '))}</span>
          <span class="text-[10px] font-mono ${isSelected ? 'text-gray-300' : 'text-gray-400'}">~${p.tokensEst} tok</span>
        </div>
        <div class="font-bold text-xs ${isSelected ? 'text-white' : 'text-gray-900'} truncate">${escapeHtml(p.title)}</div>
        <div class="text-[11px] ${isSelected ? 'text-gray-300' : 'text-blue-600'} font-semibold mt-1 truncate">Act As: ${escapeHtml(p.actAs)}</div>
      </button>
    `;
  }).join('');

  listContainer.querySelectorAll<HTMLButtonElement>('[data-prompt-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      activePromptId = btn.getAttribute('data-prompt-id') || 'conversational';
      renderPromptList();
      renderPromptViewer();
    });
  });
}

function renderPromptViewer() {
  const viewerTitle = document.getElementById('viewer-prompt-title');
  const viewerActAs = document.getElementById('viewer-act-as');
  const viewerDesc = document.getElementById('viewer-prompt-desc');
  const viewerTokens = document.getElementById('viewer-stat-tokens');
  const viewerStage = document.getElementById('viewer-stat-stage');
  const viewerTrigger = document.getElementById('viewer-stat-trigger');
  const viewerCache = document.getElementById('viewer-stat-cache');
  const viewerComponents = document.getElementById('viewer-components-container');
  const viewerCode = document.getElementById('viewer-prompt-code');

  if (!viewerCode) return;

  if (activeCategory === 'blocks' && activeBlockId) {
    const blk = allBlocks.find(b => b.id === activeBlockId);
    if (!blk) return;

    if (viewerTitle) viewerTitle.innerText = `${blk.title} (${blk.tag})`;
    if (viewerActAs) viewerActAs.innerText = blk.actAs;
    if (viewerDesc) viewerDesc.innerText = blk.description;
    if (viewerTokens) viewerTokens.innerText = `~${Math.round(blk.content.length / 4)} tok`;
    if (viewerStage) viewerStage.innerText = 'Prompt Component Block';
    if (viewerTrigger) viewerTrigger.innerText = `Injected into System Prompts`;
    if (viewerCache) viewerCache.innerText = 'Byte-stable Prefix';
    
    if (viewerComponents) {
      viewerComponents.innerHTML = `<span class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/80 font-mono text-xs font-semibold">${escapeHtml(blk.tag)}</span>`;
    }

    viewerCode.textContent = blk.content;
    return;
  }

  const prompt = allPrompts.find(p => p.id === activePromptId);
  if (!prompt) return;

  if (viewerTitle) viewerTitle.innerText = prompt.title;
  if (viewerActAs) viewerActAs.innerText = prompt.actAs;
  if (viewerDesc) viewerDesc.innerText = prompt.description;
  if (viewerTokens) viewerTokens.innerText = `~${prompt.tokensEst} tok`;
  if (viewerStage) viewerStage.innerText = prompt.pipelineStage;
  if (viewerTrigger) viewerTrigger.innerText = prompt.intentTrigger;
  if (viewerCache) viewerCache.innerText = prompt.openRouterCached ? 'Prefix Cacheable' : 'Per-Turn Dynamic';

  if (viewerComponents) {
    viewerComponents.innerHTML = prompt.components.map(c => `
      <span class="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 font-mono text-[11px] font-medium">
        ${escapeHtml(c)}
      </span>
    `).join('');
  }

  viewerCode.textContent = prompt.content;
}
