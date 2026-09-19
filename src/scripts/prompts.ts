// src/scripts/prompts.ts
import { notify, escapeHtml } from './utils';

export interface PromptBlock {
  id: string;
  tag: string;
  title: string;
  actAs: string;
  description: string;
  content: string;
  tokensEst?: number;
  pipelineStage?: string;
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
let pipelineBlocks: PromptBlock[] = [];

let activeSelectionValue = 'conversational';
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

      if (data.pipeline_py) {
        pipelineBlocks = data.pipeline_py.blocks || [];
      }

      updateSourceBadge();
      renderSelectedContent();
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

  const dropdown = document.getElementById('prompt-dropdown-filter') as HTMLSelectElement | null;
  const searchInput = document.getElementById('prompt-search-input') as HTMLInputElement | null;
  const searchBtn = document.getElementById('btn-prompt-search');
  const copyBtn = document.getElementById('btn-copy-prompt');

  // 1. Dropdown change
  if (dropdown) {
    dropdown.addEventListener('change', () => {
      activeSelectionValue = dropdown.value;
      renderSelectedContent();
    });
  }

  // 2. Search filtering
  function executeSearch() {
    if (!searchInput || !dropdown) return;
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return;

    // Search through all options in the dropdown
    let foundValue: string | null = null;
    for (let i = 0; i < dropdown.options.length; i++) {
      const opt = dropdown.options[i];
      const optText = opt.text.toLowerCase();
      const optVal = opt.value.toLowerCase();

      // Check title or tag
      if (optText.includes(q) || optVal.includes(q)) {
        foundValue = opt.value;
        break;
      }

      // Check deep content
      let itemContent = '';
      if (opt.value.startsWith('block:')) {
        const blk = allBlocks.find(b => b.id === opt.value.replace('block:', ''));
        if (blk) itemContent = `${blk.description} ${blk.actAs} ${blk.content}`.toLowerCase();
      } else if (opt.value.startsWith('pipeline:')) {
        const p = pipelineBlocks.find(b => b.id === opt.value.replace('pipeline:', ''));
        if (p) itemContent = `${p.description} ${p.actAs} ${p.content}`.toLowerCase();
      } else {
        const pr = allPrompts.find(p => p.id === opt.value);
        if (pr) itemContent = `${pr.description} ${pr.actAs} ${pr.content}`.toLowerCase();
      }

      if (itemContent.includes(q)) {
        foundValue = opt.value;
        break;
      }
    }

    if (foundValue) {
      dropdown.value = foundValue;
      activeSelectionValue = foundValue;
      renderSelectedContent();
      notify(`Found matching prompt: ${dropdown.options[dropdown.selectedIndex].text}`);
    } else {
      notify(`No matching prompt found for "${searchInput.value}"`, true);
    }
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', executeSearch);
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      }
    });
  }

  // 3. Copy button
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const activeItem = getActiveItem();
      if (activeItem && activeItem.content) {
        navigator.clipboard.writeText(activeItem.content).then(() => {
          notify('Content copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy to clipboard:', err);
          notify('Failed to copy', true);
        });
      }
    });
  }
}

function getActiveItem(): {
  title: string;
  desc: string;
  actAs: string;
  tokens: string;
  cache: string;
  stage: string;
  trigger: string;
  content: string;
} | null {
  if (activeSelectionValue.startsWith('block:')) {
    const blockId = activeSelectionValue.replace('block:', '');
    const blk = allBlocks.find(b => b.id === blockId) || allBlocks[0];
    if (!blk) return null;
    return {
      title: `${blk.title} (${blk.tag})`,
      desc: blk.description,
      actAs: blk.actAs,
      tokens: `~${Math.round(blk.content.length / 4)} tok`,
      cache: 'Byte-stable Prefix',
      stage: 'Modular XML Block',
      trigger: 'Assembled into Conversational & Socratic Prompts',
      content: blk.content,
    };
  }

  if (activeSelectionValue.startsWith('pipeline:')) {
    const pipeId = activeSelectionValue.replace('pipeline:', '');
    const p = pipelineBlocks.find(b => b.id === pipeId) || pipelineBlocks[0];
    if (!p) return null;
    return {
      title: `${p.title} (${p.tag})`,
      desc: p.description,
      actAs: p.actAs || 'Runtime Injected Context Template',
      tokens: p.tokensEst ? `~${p.tokensEst} tok` : `~${Math.round(p.content.length / 4)} tok`,
      cache: p.id === 'knowledge_base' ? 'Cached (System #2)' : 'Per-Turn Tail',
      stage: p.pipelineStage || 'app.graph.pipeline._build_generate_messages',
      trigger: p.id === 'available_topics' ? 'Intent: TOPIC_LIST' : p.id === 'section_materials' ? 'Intent: SECTION_DRILLDOWN' : 'Every User Turn',
      content: p.content,
    };
  }

  // Regular prompt
  const pr = allPrompts.find(p => p.id === activeSelectionValue) || allPrompts[0];
  if (!pr) return null;
  return {
    title: pr.title,
    desc: pr.description,
    actAs: pr.actAs,
    tokens: `~${pr.tokensEst} tok`,
    cache: pr.openRouterCached ? 'Prefix Cacheable' : 'Turn Dynamic',
    stage: pr.pipelineStage,
    trigger: pr.intentTrigger,
    content: pr.content,
  };
}

function renderSelectedContent() {
  const viewerTitle = document.getElementById('min-viewer-title');
  const viewerDesc = document.getElementById('min-viewer-desc');
  const viewerActAs = document.getElementById('min-viewer-act-as');
  const viewerTokens = document.getElementById('min-viewer-tokens');
  const viewerCache = document.getElementById('min-viewer-cache');
  const viewerStage = document.getElementById('min-viewer-stage');
  const viewerTrigger = document.getElementById('min-viewer-trigger');
  const viewerCode = document.getElementById('min-viewer-code');

  const item = getActiveItem();
  if (!item || !viewerCode) return;

  if (viewerTitle) viewerTitle.innerText = item.title;
  if (viewerDesc) viewerDesc.innerText = item.desc;
  if (viewerActAs) viewerActAs.innerText = item.actAs;
  if (viewerTokens) viewerTokens.innerText = item.tokens;
  if (viewerCache) viewerCache.innerText = item.cache;
  if (viewerStage) viewerStage.innerText = item.stage;
  if (viewerTrigger) viewerTrigger.innerText = item.trigger;
  viewerCode.textContent = item.content;
}
