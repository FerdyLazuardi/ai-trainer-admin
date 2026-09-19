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

import { SYSTEM_PROMPTS, PROMPT_BLOCKS, PIPELINE_CONTEXT_BLOCKS } from '../data/prompts';

let allPrompts: SystemPromptItem[] = [...SYSTEM_PROMPTS];
let allBlocks: PromptBlock[] = [...PROMPT_BLOCKS];
let pipelineBlocks: PromptBlock[] = [...PIPELINE_CONTEXT_BLOCKS];

let activeSource: 'prompts_py' | 'pipeline_py' = 'prompts_py';
let activeSelectionValue = 'conversational';
let dataSource = 'backend_live';

export async function loadSystemPrompts() {
  try {
    const res = await fetch('/api/prompts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.prompts) {
      if (typeof data.prompts === 'object' && !Array.isArray(data.prompts)) {
        allPrompts.forEach(p => {
          if (data.prompts[p.id]) p.content = data.prompts[p.id];
          else if (p.id === 'chit_chat' && data.prompts['chitchat']) p.content = data.prompts['chitchat'];
          else if (p.id === 'stm_summary' && data.prompts['stm_summarizer']) p.content = data.prompts['stm_summarizer'];
          else if (p.id === 'ltm_summary' && data.prompts['ltm_summarizer']) p.content = data.prompts['ltm_summarizer'];
        });
        if (data.blocks && typeof data.blocks === 'object') {
          allBlocks.forEach(b => {
            if (data.blocks[b.id]) b.content = data.blocks[b.id];
          });
        }
      } else if (Array.isArray(data.prompts)) {
        allPrompts = data.prompts;
        if (Array.isArray(data.blocks)) allBlocks = data.blocks;
      }

      dataSource = data.source || 'backend_live';
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

function populateDropdown(source: 'prompts_py' | 'pipeline_py') {
  const select = document.getElementById('prompt-select-filter') as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML = '';

  if (source === 'prompts_py') {
    // 1. Assembled Prompts group
    const grpPrompts = document.createElement('optgroup');
    grpPrompts.label = 'Assembled Prompts';
    allPrompts.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      grpPrompts.appendChild(opt);
    });
    select.appendChild(grpPrompts);

    // 2. Modular XML Blocks group
    const grpBlocks = document.createElement('optgroup');
    grpBlocks.label = 'Modular XML Blocks (prompts.py)';
    allBlocks.forEach(b => {
      const opt = document.createElement('option');
      opt.value = `block:${b.id}`;
      opt.textContent = `${b.tag} ${b.title}`;
      grpBlocks.appendChild(opt);
    });
    select.appendChild(grpBlocks);
  } else {
    // Pipeline.py items
    const grpArch = document.createElement('optgroup');
    grpArch.label = 'Pipeline Architecture';
    const optFrame = document.createElement('option');
    optFrame.value = 'pipeline:assembly_frame';
    optFrame.textContent = 'Message Frame Architecture';
    grpArch.appendChild(optFrame);
    select.appendChild(grpArch);

    const grpRuntime = document.createElement('optgroup');
    grpRuntime.label = 'Runtime Injected Blocks (pipeline.py)';
    pipelineBlocks.filter(b => b.id !== 'assembly_frame').forEach(b => {
      const opt = document.createElement('option');
      opt.value = `pipeline:${b.id}`;
      opt.textContent = `${b.tag} ${b.title}`;
      grpRuntime.appendChild(opt);
    });
    select.appendChild(grpRuntime);
  }

  // Set selected value
  select.value = activeSelectionValue;
}

function switchSource(source: 'prompts_py' | 'pipeline_py') {
  activeSource = source;
  const btnPrompts = document.getElementById('btn-source-prompts');
  const btnPipeline = document.getElementById('btn-source-pipeline');

  if (source === 'prompts_py') {
    btnPrompts?.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPrompts?.classList.remove('text-gray-500', 'font-semibold');
    btnPipeline?.classList.remove('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPipeline?.classList.add('text-gray-500', 'font-semibold');
    activeSelectionValue = 'conversational';
  } else {
    btnPipeline?.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPipeline?.classList.remove('text-gray-500', 'font-semibold');
    btnPrompts?.classList.remove('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPrompts?.classList.add('text-gray-500', 'font-semibold');
    activeSelectionValue = 'pipeline:assembly_frame';
  }

  populateDropdown(source);
  renderSelectedContent();
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
      stage: 'Modular XML Block (prompts.py)',
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

export function initPromptsTab() {
  // 1. Initial dropdown population
  populateDropdown('prompts_py');
  renderSelectedContent();
  loadSystemPrompts();

  const btnPrompts = document.getElementById('btn-source-prompts');
  const btnPipeline = document.getElementById('btn-source-pipeline');
  const select = document.getElementById('prompt-select-filter') as HTMLSelectElement | null;
  const searchInput = document.getElementById('prompt-search-input') as HTMLInputElement | null;
  const searchBtn = document.getElementById('btn-prompt-search');
  const copyBtn = document.getElementById('btn-copy-prompt');

  // Switcher buttons
  btnPrompts?.addEventListener('click', () => switchSource('prompts_py'));
  btnPipeline?.addEventListener('click', () => switchSource('pipeline_py'));

  // Dropdown change
  if (select) {
    select.addEventListener('change', () => {
      activeSelectionValue = select.value;
      renderSelectedContent();
    });
  }

  // Search
  function executeSearch() {
    if (!searchInput || !select) return;
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return;

    let foundValue: string | null = null;

    // Search through current dropdown options
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      const optText = opt.text.toLowerCase();
      const optVal = opt.value.toLowerCase();

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
      select.value = foundValue;
      activeSelectionValue = foundValue;
      renderSelectedContent();
      notify(`Matched: ${select.options[select.selectedIndex].text}`);
    } else {
      const fileName = activeSource === 'prompts_py' ? 'app/llm/prompts.py' : 'app/graph/pipeline.py';
      notify(`No match found in ${fileName}`, true);
    }
  }

  searchBtn?.addEventListener('click', executeSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  // Copy
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const activeItem = getActiveItem();
      if (activeItem && activeItem.content) {
        navigator.clipboard.writeText(activeItem.content).then(() => {
          notify('Prompt content copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy to clipboard:', err);
          notify('Failed to copy', true);
        });
      }
    });
  }
}
