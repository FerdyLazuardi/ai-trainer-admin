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

let activeFile: 'prompts_py' | 'pipeline_py' = 'prompts_py';
let activePromptsPyType: 'prompt' | 'block' = 'prompt';

let allPrompts: SystemPromptItem[] = [];
let allBlocks: PromptBlock[] = [];
let pipelineBlocks: PromptBlock[] = [];
let pipelineAssemblyFrame: any = null;

let activePromptId = 'conversational';
let activeBlockId = 'role';
let activePipelineId = 'assembly_frame';

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
        pipelineAssemblyFrame = data.pipeline_py.assembly_frame || null;
      }

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

  // 1. Search input
  const searchInput = document.getElementById('prompt-search-input') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      promptSearchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderActiveView();
    });
  }

  // 2. Primary File Switcher (prompts.py vs pipeline.py)
  const btnFilePrompts = document.getElementById('file-btn-prompts');
  const btnFilePipeline = document.getElementById('file-btn-pipeline');
  const secPrompts = document.getElementById('section-prompts-py');
  const secPipeline = document.getElementById('section-pipeline-py');

  if (btnFilePrompts && btnFilePipeline && secPrompts && secPipeline) {
    btnFilePrompts.addEventListener('click', () => {
      activeFile = 'prompts_py';
      btnFilePrompts.classList.add('active', 'text-gray-900', 'bg-white', 'shadow-2xs', 'font-bold');
      btnFilePrompts.classList.remove('text-gray-500');
      btnFilePipeline.classList.remove('active', 'text-gray-900', 'bg-white', 'shadow-2xs', 'font-bold');
      btnFilePipeline.classList.add('text-gray-500');

      secPrompts.classList.remove('hidden');
      secPipeline.classList.add('hidden');
      renderActiveView();
    });

    btnFilePipeline.addEventListener('click', () => {
      activeFile = 'pipeline_py';
      btnFilePipeline.classList.add('active', 'text-gray-900', 'bg-white', 'shadow-2xs', 'font-bold');
      btnFilePipeline.classList.remove('text-gray-500');
      btnFilePrompts.classList.remove('active', 'text-gray-900', 'bg-white', 'shadow-2xs', 'font-bold');
      btnFilePrompts.classList.add('text-gray-500');

      secPipeline.classList.remove('hidden');
      secPrompts.classList.add('hidden');
      renderActiveView();
    });
  }

  // 3. prompts.py Prompt Selectors
  const promptItemBtns = document.querySelectorAll<HTMLButtonElement>('[data-prompt-id]');
  promptItemBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activePromptsPyType = 'prompt';
      activePromptId = btn.getAttribute('data-prompt-id') || 'conversational';

      promptItemBtns.forEach(b => {
        b.classList.remove('active', 'bg-gray-900', 'text-white');
        b.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
      });
      btn.classList.add('active', 'bg-gray-900', 'text-white');
      btn.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');

      // Clear active style on block buttons
      document.querySelectorAll<HTMLButtonElement>('[data-block-id]').forEach(b => {
        b.classList.remove('bg-gray-900', 'text-white');
        b.classList.add('text-gray-600', 'bg-white');
      });

      renderActiveView();
    });
  });

  // 4. Toggle Modular Blocks button in prompts.py
  const btnToggleBlocks = document.getElementById('btn-toggle-prompt-blocks');
  const blocksRow = document.getElementById('prompts-blocks-row');
  if (btnToggleBlocks && blocksRow) {
    btnToggleBlocks.addEventListener('click', () => {
      blocksRow.classList.toggle('hidden');
      if (!blocksRow.classList.contains('hidden')) {
        activePromptsPyType = 'block';
        highlightActiveBlockBtn();
        renderActiveView();
      }
    });
  }

  // 5. Modular Block Selectors in prompts.py
  const blockItemBtns = document.querySelectorAll<HTMLButtonElement>('[data-block-id]');
  blockItemBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activePromptsPyType = 'block';
      activeBlockId = btn.getAttribute('data-block-id') || 'role';
      highlightActiveBlockBtn();

      // Deactivate prompt tab buttons
      promptItemBtns.forEach(b => {
        b.classList.remove('active', 'bg-gray-900', 'text-white');
        b.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
      });

      renderActiveView();
    });
  });

  function highlightActiveBlockBtn() {
    blockItemBtns.forEach(b => {
      if (b.getAttribute('data-block-id') === activeBlockId) {
        b.classList.add('bg-gray-900', 'text-white');
        b.classList.remove('text-gray-600', 'bg-white');
      } else {
        b.classList.remove('bg-gray-900', 'text-white');
        b.classList.add('text-gray-600', 'bg-white');
      }
    });
  }

  // 6. pipeline.py Context Block Selectors
  const pipelineItemBtns = document.querySelectorAll<HTMLButtonElement>('[data-pipeline-id]');
  pipelineItemBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activePipelineId = btn.getAttribute('data-pipeline-id') || 'assembly_frame';

      pipelineItemBtns.forEach(b => {
        b.classList.remove('active', 'bg-gray-900', 'text-white');
        b.classList.add('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');
      });
      btn.classList.add('active', 'bg-gray-900', 'text-white');
      btn.classList.remove('text-gray-500', 'hover:text-gray-900', 'hover:bg-gray-100');

      renderActiveView();
    });
  });

  // 7. Copy Prompt button
  const copyBtn = document.getElementById('btn-copy-prompt');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      let textToCopy = '';
      if (activeFile === 'prompts_py') {
        if (activePromptsPyType === 'block') {
          const blk = allBlocks.find(b => b.id === activeBlockId);
          if (blk) textToCopy = blk.content;
        } else {
          const pr = allPrompts.find(p => p.id === activePromptId);
          if (pr) textToCopy = pr.content;
        }
      } else {
        const item = pipelineBlocks.find(p => p.id === activePipelineId);
        if (item) textToCopy = item.content;
      }

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          notify('Content copied to clipboard!');
        }).catch(err => {
          console.error('Clipboard copy failed:', err);
          notify('Failed to copy', true);
        });
      }
    });
  }
}

function renderActiveView() {
  const viewerFiletag = document.getElementById('min-viewer-filetag');
  const viewerTitle = document.getElementById('min-viewer-title');
  const viewerDesc = document.getElementById('min-viewer-desc');
  const viewerActAs = document.getElementById('min-viewer-act-as');
  const viewerTokens = document.getElementById('min-viewer-tokens');
  const viewerCache = document.getElementById('min-viewer-cache');
  const viewerStage = document.getElementById('min-viewer-stage');
  const viewerTrigger = document.getElementById('min-viewer-trigger');
  const viewerCode = document.getElementById('min-viewer-code');

  if (!viewerCode) return;

  if (activeFile === 'prompts_py') {
    if (viewerFiletag) {
      viewerFiletag.innerText = 'app/llm/prompts.py';
      viewerFiletag.className = 'text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60';
    }

    if (activePromptsPyType === 'block') {
      const blk = allBlocks.find(b => b.id === activeBlockId) || allBlocks[0];
      if (!blk) return;

      if (viewerTitle) viewerTitle.innerText = `${blk.title} (${blk.tag})`;
      if (viewerDesc) viewerDesc.innerText = blk.description;
      if (viewerActAs) viewerActAs.innerText = blk.actAs;
      if (viewerTokens) viewerTokens.innerText = `~${Math.round(blk.content.length / 4)} tok`;
      if (viewerCache) viewerCache.innerText = 'Byte-stable Prefix';
      if (viewerStage) viewerStage.innerText = 'Modular XML Block';
      if (viewerTrigger) viewerTrigger.innerText = 'Assembled into Conversational & Socratic Prompts';
      viewerCode.textContent = blk.content;
      return;
    }

    const prompt = allPrompts.find(p => p.id === activePromptId) || allPrompts[0];
    if (!prompt) return;

    if (viewerTitle) viewerTitle.innerText = prompt.title;
    if (viewerDesc) viewerDesc.innerText = prompt.description;
    if (viewerActAs) viewerActAs.innerText = prompt.actAs;
    if (viewerTokens) viewerTokens.innerText = `~${prompt.tokensEst} tok`;
    if (viewerCache) viewerCache.innerText = prompt.openRouterCached ? 'Prefix Cacheable' : 'Turn Dynamic';
    if (viewerStage) viewerStage.innerText = prompt.pipelineStage;
    if (viewerTrigger) viewerTrigger.innerText = prompt.intentTrigger;
    viewerCode.textContent = prompt.content;
    return;
  }

  // activeFile === 'pipeline_py'
  if (viewerFiletag) {
    viewerFiletag.innerText = 'app/graph/pipeline.py';
    viewerFiletag.className = 'text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/60';
  }

  const pItem = pipelineBlocks.find(p => p.id === activePipelineId) || pipelineBlocks[0];
  if (!pItem) return;

  if (viewerTitle) viewerTitle.innerText = `${pItem.title} (${pItem.tag})`;
  if (viewerDesc) viewerDesc.innerText = pItem.description;
  if (viewerActAs) viewerActAs.innerText = pItem.actAs || 'Runtime Injected Context Template';
  if (viewerTokens) viewerTokens.innerText = pItem.tokensEst ? `~${pItem.tokensEst} tok` : `~${Math.round(pItem.content.length / 4)} tok`;
  if (viewerCache) viewerCache.innerText = pItem.id === 'knowledge_base' ? 'Cached (System #2)' : 'Per-Turn Tail';
  if (viewerStage) viewerStage.innerText = pItem.pipelineStage || 'app.graph.pipeline._build_generate_messages';
  if (viewerTrigger) viewerTrigger.innerText = pItem.id === 'available_topics' ? 'Intent: TOPIC_LIST' : pItem.id === 'section_materials' ? 'Intent: SECTION_DRILLDOWN' : 'Every User Turn';
  viewerCode.textContent = pItem.content;
}
