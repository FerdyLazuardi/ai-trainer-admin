// src/scripts/kb.ts
import { notify, escapeHtml, estimateIndonesianTokens } from './utils';

export interface KBTopic {
  id: string;
  title: string;
  subtopics: string[];
  roles?: string;
  file?: string;
  course?: string;
  sectionName?: string;
  content: string;
  tokens: number;
  chars: number;
  lines: number;
}

export let activeKBContent = '';
export let activeKBTokens = 0;
export let parsedTopics: KBTopic[] = [];
let allExpanded = false;

export function resetActiveKB() {
  activeKBContent = '';
  activeKBTokens = 0;
  parsedTopics = [];
}

export function extractTopics(raw: string): KBTopic[] {
  const list: KBTopic[] = [];
  if (!raw.trim()) return list;

  const docRegex = /<doc\s+([^>]+)>([\s\S]*?)<\/doc>/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = docRegex.exec(raw)) !== null) {
    idx++;
    const attrStr = match[1];
    const body = match[2].trim();

    const idMatch = attrStr.match(/id="([^"]+)"/);
    const fileMatch = attrStr.match(/file="([^"]+)"/);
    const rolesMatch = attrStr.match(/roles="([^"]+)"/);
    const secMatch = attrStr.match(/section="([^"]+)"/);
    const courseMatch = attrStr.match(/course="([^"]+)"/);

    const h1Match = body.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1].trim() : (fileMatch ? fileMatch[1].replace(/\.md$/i, '') : `Topik #${idx}`);
    const subtopics = [...body.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim());

    list.push({
      id: idMatch ? idMatch[1] : `DOC-${String(idx).padStart(3, '0')}`,
      title,
      subtopics,
      roles: rolesMatch ? rolesMatch[1] : undefined,
      file: fileMatch ? fileMatch[1] : undefined,
      course: courseMatch ? courseMatch[1] : undefined,
      sectionName: secMatch ? secMatch[1] : undefined,
      content: body,
      tokens: estimateIndonesianTokens(body),
      chars: body.length,
      lines: body.split('\n').length,
    });
  }

  // Fallback: If no <doc> tags found, parse standard Markdown by `# ` headings
  if (list.length === 0) {
    const rawBlocks = raw.split(/\n(?=#\s+)/g);
    rawBlocks.forEach((block, i) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const h1Match = trimmed.match(/^#\s+(.+)$/m);
      if (!h1Match && i === 0 && (trimmed.startsWith('<knowledge_base') || trimmed.startsWith('<kb_index>'))) {
        return;
      }
      const title = h1Match ? h1Match[1].trim() : `Topik #${i + 1}`;
      const subtopics = [...trimmed.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim());
      list.push({
        id: `TOPIC-${String(list.length + 1).padStart(3, '0')}`,
        title,
        subtopics,
        content: trimmed,
        tokens: estimateIndonesianTokens(trimmed),
        chars: trimmed.length,
        lines: trimmed.split('\n').length,
      });
    });
  }

  return list;
}

export async function loadActiveKB(force = false) {
  if (activeKBContent && !force) return;

  const kbTopicsList = document.getElementById('kb-topics-list');
  const kbViewerText = document.getElementById('kb-viewer-text');
  const btnKbRefresh = document.getElementById('btn-kb-refresh') as HTMLButtonElement | null;

  if (kbTopicsList) {
    kbTopicsList.innerHTML = `<div class="p-8 rounded-3xl bg-white border border-gray-200 text-center text-gray-400 text-xs">Loading knowledge base topics from PostgreSQL...</div>`;
  }
  if (kbViewerText) {
    kbViewerText.innerHTML = `<div class="text-center text-gray-400 py-8">Fetching active knowledge base from PostgreSQL...</div>`;
  }
  if (btnKbRefresh) btnKbRefresh.disabled = true;

  try {
    const res = await fetch('/api/kb');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    activeKBContent = data.content || '';
    activeKBTokens = data.token_count || 0;
    parsedTopics = extractTopics(activeKBContent);

    renderKBContent();
    notify('Active knowledge base loaded.');
  } catch (err: any) {
    if (kbTopicsList) {
      kbTopicsList.innerHTML = `<div class="p-6 rounded-3xl bg-rose-50 border border-rose-200 text-rose-600 text-xs">Failed to load topics: ${escapeHtml(err.message)}</div>`;
    }
    if (kbViewerText) {
      kbViewerText.innerHTML = `<div class="text-rose-500 py-4">Failed to load active KB: ${escapeHtml(err.message)}</div>`;
    }
    notify(`Failed to load KB: ${err.message}`, false);
  } finally {
    if (btnKbRefresh) btnKbRefresh.disabled = false;
  }
}

function renderTopicCard(topic: KBTopic, isExpanded: boolean): string {
  const subtopicBadges = topic.subtopics.slice(0, 8).map(st => `
    <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100/90 text-gray-700 font-mono text-[10px]" title="${escapeHtml(st)}">
      <span class="text-gray-600 font-bold mr-1">##</span>${escapeHtml(st.length > 35 ? st.slice(0, 32) + '...' : st)}
    </span>
  `).join('');

  const moreSubtopics = topic.subtopics.length > 8
    ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-mono text-[10px]">+${topic.subtopics.length - 8} more</span>`
    : '';

  const roleBadge = topic.roles
    ? `<span class="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200/60 text-[10px] font-bold text-blue-700 uppercase tracking-wider">${escapeHtml(topic.roles)}</span>`
    : '';

  const fileBadge = topic.file
    ? `<span class="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] font-mono text-gray-600 truncate max-w-[220px]" title="${escapeHtml(topic.file)}">${escapeHtml(topic.file)}</span>`
    : '';

  return `
    <div class="topic-card rounded-2xl bg-white border border-gray-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden" data-topic-id="${escapeHtml(topic.id)}">
      <!-- Card Header -->
      <div class="topic-card-header p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/70 select-none transition-colors border-b border-gray-100">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 font-bold font-mono text-base shrink-0 shadow-2xs">
            #
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">${escapeHtml(topic.id)}</span>
              ${roleBadge}
              ${fileBadge}
            </div>
            <h3 class="text-sm sm:text-base font-bold text-gray-900 leading-snug tracking-tight">
              <span class="text-emerald-700 font-mono font-bold mr-1">#</span>${escapeHtml(topic.title)}
            </h3>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
          <span class="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 font-mono tabular-nums">
            ~${topic.tokens.toLocaleString('en-US')} tokens
          </span>
          <span class="px-2 py-1 rounded-lg bg-gray-100 text-[11px] font-semibold text-gray-600 tabular-nums">
            ${topic.subtopics.length} subtopics
          </span>
          <button type="button" class="btn-copy-topic p-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-600 hover:text-gray-900 transition-colors cursor-pointer" data-topic-id="${escapeHtml(topic.id)}" title="Copy Topic Markdown">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
          <button type="button" class="btn-toggle-topic p-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-400 hover:text-gray-800 transition-transform cursor-pointer ${isExpanded ? 'rotate-180' : ''}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
      </div>

      ${topic.subtopics.length > 0 ? `
        <div class="px-4 sm:px-5 py-2.5 bg-gray-50/40 border-b border-gray-100 flex flex-wrap items-center gap-1.5">
          <span class="text-[10px] font-bold uppercase text-gray-400 mr-1 tracking-wider">Subtopics (##):</span>
          ${subtopicBadges}
          ${moreSubtopics}
        </div>
      ` : ''}

      <!-- Topic Markdown Body (Collapsible) -->
      <div class="topic-card-body ${isExpanded ? '' : 'hidden'} p-4 sm:p-5 bg-[#FAFAFA] border-t border-gray-100">
        <div class="flex items-center justify-between pb-2 mb-3 border-b border-gray-200/60 text-[11px] text-gray-500 font-mono">
          <span>Markdown Content (# ${escapeHtml(topic.title)})</span>
          <span>${topic.lines} lines &bull; ${(topic.chars / 1024).toFixed(1)} KB</span>
        </div>
        <pre class="font-mono text-xs leading-relaxed text-gray-800 whitespace-pre-wrap select-text overflow-x-auto max-h-[500px] overflow-y-auto">${escapeHtml(topic.content)}</pre>
      </div>
    </div>
  `;
}

export function renderKBContent() {
  const kbStatTokens = document.getElementById('kb-stat-tokens');
  const kbStatTopics = document.getElementById('kb-stat-topics');
  const kbStatSubtopics = document.getElementById('kb-stat-subtopics');
  const kbStatChars = document.getElementById('kb-stat-chars');
  const kbStatLines = document.getElementById('kb-stat-lines');
  const kbTopicSelect = document.getElementById('kb-topic-select') as HTMLSelectElement | null;
  const kbViewerText = document.getElementById('kb-viewer-text');

  if (!activeKBContent) {
    if (kbViewerText) {
      kbViewerText.innerHTML = `<div class="text-gray-400 py-8 text-center">Active knowledge base is empty. Trigger sync to populate.</div>`;
    }
    return;
  }

  const chars = activeKBContent.length;
  const estTokens = activeKBTokens || estimateIndonesianTokens(activeKBContent);
  const lines = activeKBContent.split('\n');

  if (kbStatTokens) kbStatTokens.innerText = estTokens.toLocaleString('en-US');
  if (kbStatChars) kbStatChars.innerText = `${(chars / 1024).toFixed(1)} KB`;
  if (kbStatLines) kbStatLines.innerText = `${lines.length.toLocaleString('en-US')} lines`;

  if (kbStatTopics) kbStatTopics.innerText = parsedTopics.length.toLocaleString('en-US');

  const totalSubtopics = parsedTopics.reduce((acc, t) => acc + t.subtopics.length, 0);
  if (kbStatSubtopics) kbStatSubtopics.innerText = totalSubtopics.toLocaleString('en-US');

  if (kbTopicSelect) {
    kbTopicSelect.innerHTML = `<option value="">All Topics (#) (${parsedTopics.length})</option>` +
      parsedTopics.map(t => `<option value="${escapeHtml(t.id)}"># ${escapeHtml(t.title)} (${t.subtopics.length} subtopics)</option>`).join('');
  }

  if (kbViewerText) {
    kbViewerText.innerText = activeKBContent;
  }

  applyKBFilter();
}

export function applyKBFilter() {
  const kbTopicsList = document.getElementById('kb-topics-list');
  const kbSearchInput = document.getElementById('kb-search-input') as HTMLInputElement | null;
  const kbTopicSelect = document.getElementById('kb-topic-select') as HTMLSelectElement | null;
  const kbMatchBadge = document.getElementById('kb-match-badge');

  if (!kbTopicsList) return;
  const q = (kbSearchInput ? kbSearchInput.value : '').trim().toLowerCase();
  const selectedId = (kbTopicSelect ? kbTopicSelect.value : '').trim();

  if (parsedTopics.length === 0) {
    kbTopicsList.innerHTML = `<div class="p-8 rounded-3xl bg-white border border-gray-200 text-center text-gray-400 text-xs">No topics found.</div>`;
    if (kbMatchBadge) kbMatchBadge.innerText = '0 topics';
    return;
  }

  const filtered = parsedTopics.filter(t => {
    const matchesId = !selectedId || t.id === selectedId;
    if (!matchesId) return false;

    if (!q) return true;
    const inTitle = t.title.toLowerCase().includes(q);
    const inContent = t.content.toLowerCase().includes(q);
    const inSubtopics = t.subtopics.some(st => st.toLowerCase().includes(q));
    const inRoles = t.roles ? t.roles.toLowerCase().includes(q) : false;
    const inFile = t.file ? t.file.toLowerCase().includes(q) : false;

    return inTitle || inContent || inSubtopics || inRoles || inFile;
  });

  if (kbMatchBadge) {
    kbMatchBadge.innerText = `${filtered.length} active topic(s)`;
  }

  if (filtered.length === 0) {
    kbTopicsList.innerHTML = `
      <div class="p-8 rounded-3xl bg-white border border-gray-200 text-center space-y-2">
        <p class="text-sm font-semibold text-gray-700">No topics found</p>
        <p class="text-xs text-gray-400">Try searching for different keywords or hashtags.</p>
      </div>
    `;
    return;
  }

  // If filtered by specific topic or search query, expand matching cards
  const shouldExpand = Boolean(q || selectedId || allExpanded);

  kbTopicsList.innerHTML = filtered.map(t => renderTopicCard(t, shouldExpand)).join('');

  // Attach card interaction listeners
  attachTopicCardListeners();
}

function attachTopicCardListeners() {
  const cards = document.querySelectorAll('.topic-card');

  cards.forEach(card => {
    const header = card.querySelector('.topic-card-header');
    const body = card.querySelector('.topic-card-body');
    const toggleBtn = card.querySelector('.btn-toggle-topic');
    const copyBtn = card.querySelector('.btn-copy-topic');
    const topicId = card.getAttribute('data-topic-id');

    if (header && body && toggleBtn) {
      header.addEventListener('click', (e: Event) => {
        // Prevent toggle if copy button was clicked
        if ((e.target as HTMLElement).closest('.btn-copy-topic')) return;

        const isHidden = body.classList.contains('hidden');
        if (isHidden) {
          body.classList.remove('hidden');
          toggleBtn.classList.add('rotate-180');
        } else {
          body.classList.add('hidden');
          toggleBtn.classList.remove('rotate-180');
        }
      });
    }

    if (copyBtn && topicId) {
      copyBtn.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        const targetTopic = parsedTopics.find(t => t.id === topicId);
        if (targetTopic) {
          navigator.clipboard.writeText(targetTopic.content);
          notify(`Topic "# ${targetTopic.title}" copied to clipboard!`);
        }
      });
    }
  });
}

export function initKbTab() {
  const kbSearchInput = document.getElementById('kb-search-input');
  const kbTopicSelect = document.getElementById('kb-topic-select');
  const btnKbViewTopics = document.getElementById('btn-kb-view-topics');
  const btnKbViewRaw = document.getElementById('btn-kb-view-raw');
  const btnKbToggleExpand = document.getElementById('btn-kb-toggle-expand') as HTMLButtonElement | null;
  const btnKbCopyAll = document.getElementById('btn-kb-copy-all');
  const btnKbDownloadFile = document.getElementById('btn-kb-download-file');
  const btnKbRefresh = document.getElementById('btn-kb-refresh');

  const kbTopicsContainer = document.getElementById('kb-topics-container');
  const kbRawContainer = document.getElementById('kb-raw-container');

  if (kbSearchInput) kbSearchInput.addEventListener('input', applyKBFilter);
  if (kbTopicSelect) kbTopicSelect.addEventListener('change', applyKBFilter);

  // View Switcher: Topic Cards vs Raw Markdown
  if (btnKbViewTopics && btnKbViewRaw && kbTopicsContainer && kbRawContainer) {
    btnKbViewTopics.addEventListener('click', () => {
      kbTopicsContainer.classList.remove('hidden');
      kbRawContainer.classList.add('hidden');

      btnKbViewTopics.classList.add('bg-white', 'text-gray-900', 'shadow-2xs');
      btnKbViewTopics.classList.remove('text-gray-600');
      btnKbViewRaw.classList.remove('bg-white', 'text-gray-900', 'shadow-2xs');
      btnKbViewRaw.classList.add('text-gray-600');
    });

    btnKbViewRaw.addEventListener('click', () => {
      kbTopicsContainer.classList.add('hidden');
      kbRawContainer.classList.remove('hidden');

      btnKbViewRaw.classList.add('bg-white', 'text-gray-900', 'shadow-2xs');
      btnKbViewRaw.classList.remove('text-gray-600');
      btnKbViewTopics.classList.remove('bg-white', 'text-gray-900', 'shadow-2xs');
      btnKbViewTopics.classList.add('text-gray-600');
    });
  }

  // Expand / Collapse All Topics
  if (btnKbToggleExpand) {
    btnKbToggleExpand.addEventListener('click', () => {
      allExpanded = !allExpanded;
      btnKbToggleExpand.innerText = allExpanded ? 'Collapse All' : 'Expand All';

      const bodies = document.querySelectorAll('.topic-card-body');
      const toggles = document.querySelectorAll('.btn-toggle-topic');

      bodies.forEach(b => {
        if (allExpanded) {
          b.classList.remove('hidden');
        } else {
          b.classList.add('hidden');
        }
      });

      toggles.forEach(t => {
        if (allExpanded) {
          t.classList.add('rotate-180');
        } else {
          t.classList.remove('rotate-180');
        }
      });
    });
  }

  if (btnKbCopyAll) {
    btnKbCopyAll.addEventListener('click', () => {
      if (!activeKBContent) return notify('Knowledge base is empty.', false);
      navigator.clipboard.writeText(activeKBContent);
      notify('Full active knowledge copied to clipboard!');
    });
  }

  if (btnKbDownloadFile) {
    btnKbDownloadFile.addEventListener('click', () => {
      if (!activeKBContent) return notify('Knowledge base is empty.', false);
      const blob = new Blob([activeKBContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'active_cag_kb.md';
      a.click();
      URL.revokeObjectURL(url);
      notify('Downloaded active_cag_kb.md');
    });
  }

  if (btnKbRefresh) {
    btnKbRefresh.addEventListener('click', () => loadActiveKB(true));
  }
}
