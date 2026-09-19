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

import { PROMPT_BLOCKS } from '../data/prompts';

let allBlocks: PromptBlock[] = [...PROMPT_BLOCKS];
let dataSource = 'backend_live';

function getAllPromptsCombinedContent(): string {
  return allBlocks.map(b => b.content).join('\n\n');
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

function renderContent() {
  const content = getAllPromptsCombinedContent();
  const tokensEst = Math.round(content.length / 3.8);

  const promptStatTokens = document.getElementById('prompt-stat-tokens');
  if (promptStatTokens) {
    promptStatTokens.innerText = tokensEst.toLocaleString('en-US');
  }

  const viewerTokens = document.getElementById('min-viewer-tokens');
  if (viewerTokens) {
    viewerTokens.innerText = `~${tokensEst.toLocaleString('en-US')} tok`;
  }

  const viewerCode = document.getElementById('min-viewer-code');
  if (viewerCode) {
    viewerCode.textContent = content;
  }
}

export function initPromptsTab() {
  renderContent();
  loadSystemPrompts();

  const copyBtn = document.getElementById('btn-copy-prompt');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const content = getAllPromptsCombinedContent();
      if (content) {
        navigator.clipboard.writeText(content).then(() => {
          notify('Prompt content copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy to clipboard:', err);
          notify('Failed to copy', true);
        });
      }
    });
  }
}
