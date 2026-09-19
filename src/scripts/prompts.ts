// src/scripts/prompts.ts
import { notify } from './utils';

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

import { PROMPT_BLOCKS, PIPELINE_CONTEXT_BLOCKS } from '../data/prompts';

let allBlocks: PromptBlock[] = [...PROMPT_BLOCKS];
let pipelineBlocks: PromptBlock[] = [...PIPELINE_CONTEXT_BLOCKS];

let activeSource: 'prompts_py' | 'pipeline_py' = 'prompts_py';
let dataSource = 'backend_live';

function getAllPromptsCombinedContent(): string {
  return allBlocks.map(b => b.content).join('\n\n');
}

function getAllPipelineCombinedContent(): string {
  return pipelineBlocks.map(b => b.content).join('\n\n');
}

export async function loadSystemPrompts() {
  try {
    const res = await fetch('/api/prompts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.blocks || data.prompts) {
      if (data.blocks && typeof data.blocks === 'object') {
        allBlocks.forEach(b => {
          if (data.blocks[b.id]) {
            b.content = data.blocks[b.id];
          } else if (b.id === 'socratic_mode' && data.blocks['mode']) {
            b.content = data.blocks['mode'];
          } else if (b.id === 'disambig' && data.blocks['disambiguate']) {
            b.content = data.blocks['disambiguate'];
          }
        });
      }

      dataSource = data.source || 'backend_live';
      updateSourceBadge();
      renderContent();
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

function switchSource(source: 'prompts_py' | 'pipeline_py') {
  activeSource = source;
  const btnPrompts = document.getElementById('btn-source-prompts');
  const btnPipeline = document.getElementById('btn-source-pipeline');

  if (source === 'prompts_py') {
    btnPrompts?.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPrompts?.classList.remove('text-gray-500', 'font-semibold');
    btnPipeline?.classList.remove('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPipeline?.classList.add('text-gray-500', 'font-semibold');
  } else {
    btnPipeline?.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPipeline?.classList.remove('text-gray-500', 'font-semibold');
    btnPrompts?.classList.remove('active', 'bg-white', 'text-gray-900', 'shadow-xs', 'font-bold');
    btnPrompts?.classList.add('text-gray-500', 'font-semibold');
  }

  renderContent();
}

function getCurrentData() {
  if (activeSource === 'prompts_py') {
    const content = getAllPromptsCombinedContent();
    return {
      title: 'app/llm/prompts.py',
      desc: 'All modular XML prompt blocks combined without separation',
      tokens: `~${Math.round(content.length / 4)} tok`,
      cache: 'Byte-stable Prefix Cacheable',
      stage: 'app.llm.prompts (Full System Prompt)',
      trigger: 'All Generation Turns',
      content,
    };
  }

  const content = getAllPipelineCombinedContent();
  return {
    title: 'app/graph/pipeline.py',
    desc: 'Complete message frame architecture and runtime injected XML blocks',
    tokens: `~${Math.round(content.length / 4)} tok`,
    cache: 'Hybrid (Prefix Cache + Dynamic Tail)',
    stage: 'app.graph.pipeline._build_generate_messages',
    trigger: 'Every User Turn & Routing Intents',
    content,
  };
}

function renderContent() {
  const viewerTitle = document.getElementById('min-viewer-title');
  const viewerDesc = document.getElementById('min-viewer-desc');
  const viewerTokens = document.getElementById('min-viewer-tokens');
  const viewerCache = document.getElementById('min-viewer-cache');
  const viewerStage = document.getElementById('min-viewer-stage');
  const viewerTrigger = document.getElementById('min-viewer-trigger');
  const viewerCode = document.getElementById('min-viewer-code');

  const data = getCurrentData();
  if (!viewerCode) return;

  if (viewerTitle) viewerTitle.innerText = data.title;
  if (viewerDesc) viewerDesc.innerText = data.desc;
  if (viewerTokens) viewerTokens.innerText = data.tokens;
  if (viewerCache) viewerCache.innerText = data.cache;
  if (viewerStage) viewerStage.innerText = data.stage;
  if (viewerTrigger) viewerTrigger.innerText = data.trigger;
  viewerCode.textContent = data.content;
}

export function initPromptsTab() {
  renderContent();
  loadSystemPrompts();

  const btnPrompts = document.getElementById('btn-source-prompts');
  const btnPipeline = document.getElementById('btn-source-pipeline');
  const copyBtn = document.getElementById('btn-copy-prompt');

  btnPrompts?.addEventListener('click', () => switchSource('prompts_py'));
  btnPipeline?.addEventListener('click', () => switchSource('pipeline_py'));

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const data = getCurrentData();
      if (data && data.content) {
        navigator.clipboard.writeText(data.content).then(() => {
          notify('Prompt content copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy to clipboard:', err);
          notify('Failed to copy', true);
        });
      }
    });
  }
}
