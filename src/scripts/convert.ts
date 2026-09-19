// src/scripts/convert.ts
import { notify, escapeHtml, estimateIndonesianTokens } from './utils';

declare const XLSX: any;

export function initConvertTab() {
  const convertFileInput = document.getElementById('convert-file-input') as HTMLInputElement | null;
  const convertDropzone = document.getElementById('convert-dropzone');
  const convertFileStatus = document.getElementById('convert-file-status');
  const convertFileName = document.getElementById('convert-file-name');
  const convertNoiseStats = document.getElementById('convert-noise-stats');
  const convertParseIndicator = document.getElementById('convert-parse-indicator');
  const convertParseStatusText = document.getElementById('convert-parse-status-text');

  const convertModelSelect = document.getElementById('convert-model-select') as HTMLSelectElement | null;
  const convertModelStatus = document.getElementById('convert-model-status');
  const convertModelCountBadge = document.getElementById('convert-model-count-badge');
  const convertDocType = document.getElementById('convert-doc-type') as HTMLSelectElement | null;
  const convertTopic = document.getElementById('convert-topic') as HTMLInputElement | null;
  const convertParsingInstr = document.getElementById('convert-parsing-instr') as HTMLInputElement | null;
  const convertEnableRoleblock = document.getElementById('convert-enable-roleblock') as HTMLInputElement | null;
  const btnRunStandardize = document.getElementById('btn-run-standardize') as HTMLButtonElement | null;
  const btnRunStandardizeFill = document.getElementById('btn-run-standardize-fill') as HTMLElement | null;
  const btnRunStandardizeSpinner = document.getElementById('btn-run-standardize-spinner') as HTMLElement | null;
  const btnRunStandardizeText = document.getElementById('btn-run-standardize-text') as HTMLElement | null;

  let isStandardizing = false;

  function updateStandardizeBtnState() {
    if (!btnRunStandardize || !rawMarkdownInput) return;
    if (isStandardizing) return;

    const hasContent = rawMarkdownInput.value.trim().length > 0;
    btnRunStandardize.disabled = !hasContent;

    if (btnRunStandardizeFill) {
      btnRunStandardizeFill.style.width = '0%';
      btnRunStandardizeFill.className = "absolute left-0 top-0 bottom-0 bg-emerald-600 transition-all duration-300 ease-out pointer-events-none";
    }
    if (btnRunStandardizeSpinner) {
      btnRunStandardizeSpinner.classList.add('hidden');
    }
    if (btnRunStandardizeText) {
      btnRunStandardizeText.innerText = 'Standardize to CAG Markdown';
    }

    if (hasContent) {
      btnRunStandardize.className = "relative overflow-hidden w-full py-2.5 px-4 rounded-xl bg-gray-900 hover:bg-black active:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-2 select-none";
    } else {
      btnRunStandardize.className = "relative overflow-hidden w-full py-2.5 px-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 text-xs font-bold transition-all shadow-xs cursor-not-allowed flex items-center justify-center gap-2 mt-2 select-none";
    }
  }

  async function loadFreeModels() {
    if (!convertModelSelect) return;
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data && data.models && data.models.length > 0) {
        const defaultModel = data.defaultModel || 'oc/mimo-v2.5-free';
        const savedModel = localStorage.getItem('cag_selected_model') || defaultModel;

        convertModelSelect.innerHTML = '';
        const opencodeGroup = document.createElement('optgroup');
        opencodeGroup.label = 'OpenCode';
        const openrouterGroup = document.createElement('optgroup');
        openrouterGroup.label = 'OpenRouter';

        data.models.forEach((m: { id: string; name: string; provider?: string }) => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          if (m.provider === 'OpenRouter' || m.id.startsWith('openrouter/')) {
            openrouterGroup.appendChild(opt);
          } else {
            opencodeGroup.appendChild(opt);
          }
        });

        if (opencodeGroup.children.length > 0) convertModelSelect.appendChild(opencodeGroup);
        if (openrouterGroup.children.length > 0) convertModelSelect.appendChild(openrouterGroup);

        if (data.models.some((m: any) => m.id === savedModel)) {
          convertModelSelect.value = savedModel;
        } else {
          convertModelSelect.value = defaultModel;
        }

        if (convertModelStatus) {
          convertModelStatus.innerText = 'Connected';
          convertModelStatus.classList.remove('text-amber-600');
          convertModelStatus.classList.add('text-emerald-600');
        }
        if (convertModelCountBadge) {
          convertModelCountBadge.innerText = `${data.models.length} Models (OpenCode + OpenRouter)`;
        }
      }
    } catch {
      if (convertModelStatus) {
        convertModelStatus.innerText = 'Offline (Fallback)';
        convertModelStatus.classList.remove('text-emerald-600');
        convertModelStatus.classList.add('text-amber-600');
      }
    }
  }

  if (convertModelSelect) {
    convertModelSelect.addEventListener('change', () => {
      localStorage.setItem('cag_selected_model', convertModelSelect.value);
    });
  }

  loadFreeModels();

  const rawMarkdownInput = document.getElementById('raw-markdown-input') as HTMLTextAreaElement | null;
  const rawCharsBadge = document.getElementById('raw-chars-badge');
  const btnClearRaw = document.getElementById('btn-clear-raw');

  const stdMarkdownOutput = document.getElementById('std-markdown-output') as HTMLTextAreaElement | null;
  const stdTokensBadge = document.getElementById('std-tokens-badge');
  const checkH1 = document.getElementById('check-h1');
  const checkBridge = document.getElementById('check-bridge');
  const checkRole = document.getElementById('check-role');

  const btnCopyStd = document.getElementById('btn-copy-std');
  const btnDownloadStd = document.getElementById('btn-download-std');

  function updateRawMetrics() {
    if (!rawMarkdownInput || !rawCharsBadge) return;
    const len = rawMarkdownInput.value.length;
    rawCharsBadge.innerText = `${len.toLocaleString('id-ID')} chars`;
    updateStandardizeBtnState();
  }
  if (rawMarkdownInput) {
    rawMarkdownInput.addEventListener('input', updateRawMetrics);
  }
  updateStandardizeBtnState();

  if (btnClearRaw) {
    btnClearRaw.addEventListener('click', () => {
      if (rawMarkdownInput) {
        rawMarkdownInput.value = '';
        updateRawMetrics();
      }
      if (convertFileStatus) convertFileStatus.classList.add('hidden');
      if (convertNoiseStats) convertNoiseStats.classList.add('hidden');
      if (convertFileInput) convertFileInput.value = '';
    });
  }

  function updateStdMetrics() {
    if (!stdMarkdownOutput || !stdTokensBadge) return;
    const text = stdMarkdownOutput.value;
    const estTokens = estimateIndonesianTokens(text);
    stdTokensBadge.innerText = `~${estTokens.toLocaleString('id-ID')} tokens`;

    const hasH1 = /^#\s+.+/m.test(text);
    const hasBridge = /[:：]\s*$/m.test(text);
    const hasRole = /<role_block\s+roles=/.test(text);

    if (checkH1) {
      if (hasH1) {
        checkH1.classList.remove('bg-gray-100', 'text-gray-400');
        checkH1.classList.add('bg-emerald-100', 'text-emerald-800', 'font-bold');
      } else {
        checkH1.classList.add('bg-gray-100', 'text-gray-400');
        checkH1.classList.remove('bg-emerald-100', 'text-emerald-800', 'font-bold');
      }
    }

    if (checkBridge) {
      if (hasBridge) {
        checkBridge.classList.remove('bg-gray-100', 'text-gray-400');
        checkBridge.classList.add('bg-emerald-100', 'text-emerald-800', 'font-bold');
      } else {
        checkBridge.classList.add('bg-gray-100', 'text-gray-400');
        checkBridge.classList.remove('bg-emerald-100', 'text-emerald-800', 'font-bold');
      }
    }

    const enableRole = convertEnableRoleblock ? convertEnableRoleblock.checked : false;
    if (checkRole) {
      if (!enableRole) {
        checkRole.classList.remove('bg-emerald-100', 'text-emerald-800', 'font-bold');
        checkRole.classList.add('bg-gray-100', 'text-gray-400');
        checkRole.innerText = '<role_block> (Off)';
      } else {
        checkRole.innerText = '<role_block>';
        if (hasRole) {
          checkRole.classList.remove('bg-gray-100', 'text-gray-400');
          checkRole.classList.add('bg-emerald-100', 'text-emerald-800', 'font-bold');
        } else {
          checkRole.classList.add('bg-gray-100', 'text-gray-400');
          checkRole.classList.remove('bg-emerald-100', 'text-emerald-800', 'font-bold');
        }
      }
    }
  }
  if (stdMarkdownOutput) {
    stdMarkdownOutput.addEventListener('input', updateStdMetrics);
  }
  if (convertEnableRoleblock) {
    convertEnableRoleblock.addEventListener('change', updateStdMetrics);
  }

  async function parseExcelFile(file: File): Promise<string> {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS library is still loading. Please try again in a moment.');
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetNames = wb.SheetNames;
    if (!sheetNames || sheetNames.length === 0) {
      throw new Error('Spreadsheet has no readable sheets.');
    }

    const cleanCell = (v: any) => {
      if (v === null || v === undefined) return '';
      return String(v).replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
    };

    const parts: string[] = [];
    for (const sheetName of sheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!aoa || aoa.length === 0) continue;

      const rows = aoa.map(r => (Array.isArray(r) ? r.map(cleanCell) : []));
      if (rows.length === 0) continue;

      let headerIdx = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const cells = rows[i].filter(c => c && c.length > 0 && c.length < 50);
        if (cells.length >= 2) {
          headerIdx = i;
          break;
        }
      }

      const headers = rows[headerIdx] || [];
      const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c.length > 0));
      if (dataRows.length === 0) continue;

      const lowerHeaders = headers.map(h => String(h).toLowerCase());
      const has = (...needles: string[]) => needles.some(n => lowerHeaders.some(h => h.includes(n)));

      if (has('topik', 'topic') && has('script', 'narasi', 'naskah')) {
        const topikCol = lowerHeaders.findIndex(h => h.includes('topik') || h.includes('topic'));
        const scriptCol = lowerHeaders.findIndex(h => h.includes('script') || h.includes('narasi') || h.includes('naskah'));
        for (const row of dataRows) {
          const topik = cleanCell(row[topikCol]);
          const script = cleanCell(row[scriptCol]);
          if (script.length < 20) continue;
          parts.push(`# ${topik || sheetName}\n\n${script}\n`);
        }
      } else if (has('speaker', 'tokoh') && has('dialog', 'script')) {
        const tahapanCol = lowerHeaders.findIndex(h => h.includes('tahap') || h.includes('stage'));
        const speakerCol = lowerHeaders.findIndex(h => h.includes('speaker') || h.includes('tokoh'));
        const dialogCol = lowerHeaders.findIndex(h => h.includes('dialog') || h.includes('script'));

        let currentTahap = 'Dialog';
        for (const row of dataRows) {
          const tahapan = tahapanCol >= 0 ? cleanCell(row[tahapanCol]) : '';
          const speaker = speakerCol >= 0 ? cleanCell(row[speakerCol]) : '';
          const dialog = cleanCell(row[dialogCol]);
          if (tahapan && tahapan !== '-') currentTahap = tahapan;
          if (dialog) {
            const label = speaker ? `**${speaker}:** ` : '';
            parts.push(`# ${sheetName} - ${currentTahap}\n\n${label}${dialog}\n`);
          }
        }
      } else {
        const cols = headers.length;
        const safeH = headers.map(h => h || 'Col');
        const tableLines = [
          `# ${sheetName}`,
          '',
          `| ${safeH.join(' | ')} |`,
          `| ${safeH.map(() => '---').join(' | ')} |`
        ];
        for (const row of dataRows) {
          const cells = Array.from({ length: cols }, (_, idx) => (cleanCell(row[idx]) || '').replace(/\|/g, '\\|'));
          tableLines.push(`| ${cells.join(' | ')} |`);
        }
        parts.push(tableLines.join('\n') + '\n');
      }
    }

    if (parts.length === 0) {
      throw new Error('No content rows found in workbook.');
    }
    return parts.join('\n\n');
  }

  async function handleConvertFile(file: File) {
    if (!file) return;

    if (convertFileName) convertFileName.innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (convertFileStatus) convertFileStatus.classList.remove('hidden');
    if (convertNoiseStats) convertNoiseStats.classList.add('hidden');

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'md' || ext === 'txt') {
      const text = await file.text();
      if (rawMarkdownInput) rawMarkdownInput.value = text;
      updateRawMetrics();
      notify(`Loaded ${file.name}`);
      return;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      if (convertParseIndicator && convertParseStatusText) {
        convertParseIndicator.classList.remove('hidden');
        convertParseStatusText.innerText = 'Parsing Excel sheets via SheetJS...';
      }
      try {
        const md = await parseExcelFile(file);
        if (rawMarkdownInput) rawMarkdownInput.value = md;
        updateRawMetrics();
        notify(`Parsed Excel workbook (${file.name})!`);
      } catch (err: any) {
        notify(`Excel parse error: ${err.message}`, false);
      } finally {
        if (convertParseIndicator) convertParseIndicator.classList.add('hidden');
      }
      return;
    }

    if (ext === 'pptx' || ext === 'ppt' || ext === 'pdf') {
      if (convertParseIndicator && convertParseStatusText) {
        convertParseIndicator.classList.remove('hidden');
        convertParseStatusText.innerText = 'Uploading to LlamaParse cloud...';
      }

      try {
        const fd = new FormData();
        fd.append('file', file);
        if (convertParsingInstr && convertParsingInstr.value.trim()) {
          fd.append('parsing_instruction', convertParsingInstr.value.trim());
        }

        const startRes = await fetch('/api/parse/start', {
          method: 'POST',
          body: fd
        });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.error || 'Upload failed');

        const jobId = startData.job_id;
        if (convertParseStatusText) convertParseStatusText.innerText = 'LlamaParse processing (polling job)...';

        let attempts = 0;
        const maxAttempts = 60;
        const pollTimer = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch(`/api/parse/status?job_id=${encodeURIComponent(jobId)}`);
            const statusData = await statusRes.json();
            if (statusData.status === 'SUCCESS') {
              clearInterval(pollTimer);
              if (convertParseStatusText) convertParseStatusText.innerText = 'Retrieving & stripping noise...';
              const resultRes = await fetch(`/api/parse/result?job_id=${encodeURIComponent(jobId)}`);
              const resultData = await resultRes.json();
              if (convertParseIndicator) convertParseIndicator.classList.add('hidden');

              if (rawMarkdownInput) rawMarkdownInput.value = resultData.markdown || '';
              updateRawMetrics();

              if (convertNoiseStats && resultData.stats) {
                const s = resultData.stats;
                const droppedDesc = s.dropped_slides && s.dropped_slides.length > 0 ? ` (${s.dropped_slides.join(', ')})` : '';
                convertNoiseStats.innerText = `Noise filter: ${s.kept_slides}/${s.original_slides} slides kept, ${s.noise_lines_stripped} lines stripped${droppedDesc}`;
                convertNoiseStats.classList.remove('hidden');
              }

              notify(`Parsed ${file.name} successfully!`);
            } else if (statusData.status === 'ERROR') {
              clearInterval(pollTimer);
              if (convertParseIndicator) convertParseIndicator.classList.add('hidden');
              notify('LlamaParse reported an error on this file.', false);
            } else if (attempts >= maxAttempts) {
              clearInterval(pollTimer);
              if (convertParseIndicator) convertParseIndicator.classList.add('hidden');
              notify('Parsing timed out after 2.5 minutes.', false);
            }
          } catch (pollErr: any) {
            clearInterval(pollTimer);
            if (convertParseIndicator) convertParseIndicator.classList.add('hidden');
            notify(`Polling error: ${pollErr.message}`, false);
          }
        }, 2500);

      } catch (err: any) {
        if (convertParseIndicator) convertParseIndicator.classList.add('hidden');
        notify(`Parse start failed: ${err.message}`, false);
      }
    }
  }

  if (convertFileInput) {
    convertFileInput.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) handleConvertFile(file);
    });
  }

  if (convertDropzone) {
    ['dragenter', 'dragover'].forEach(name => {
      convertDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        convertDropzone.classList.add('border-emerald-500', 'bg-emerald-50/20');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      convertDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        convertDropzone.classList.remove('border-emerald-500', 'bg-emerald-50/20');
      });
    });
    convertDropzone.addEventListener('drop', (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleConvertFile(file);
    });
  }

  // Standardize via LLM (streaming)
  if (btnRunStandardize) {
    btnRunStandardize.addEventListener('click', async () => {
      const rawText = rawMarkdownInput ? rawMarkdownInput.value.trim() : '';
      if (!rawText) {
        notify('Please provide raw markdown or upload a file first.', false);
        return;
      }

      isStandardizing = true;
      btnRunStandardize.disabled = true;
      btnRunStandardize.className = "relative overflow-hidden w-full py-2.5 px-4 rounded-xl bg-gray-900 text-white text-xs font-bold transition-all shadow-xs cursor-wait flex items-center justify-center gap-2 mt-2 select-none";
      
      if (btnRunStandardizeSpinner) btnRunStandardizeSpinner.classList.remove('hidden');
      if (btnRunStandardizeFill) {
        btnRunStandardizeFill.className = "absolute left-0 top-0 bottom-0 bg-emerald-600 transition-all duration-300 ease-out pointer-events-none";
        btnRunStandardizeFill.style.width = '15%';
      }
      if (btnRunStandardizeText) btnRunStandardizeText.innerText = 'Connecting to 9router (0.0s)...';
      
      if (stdMarkdownOutput) stdMarkdownOutput.value = '';

      const startTime = Date.now();
      let firstChunkReceived = false;
      let totalReceivedChars = 0;

      const progressTimer = setInterval(() => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const numSec = parseFloat(elapsedSec);

        if (!firstChunkReceived) {
          if (numSec < 2.5) {
            if (btnRunStandardizeText) btnRunStandardizeText.innerText = `Connecting to 9router (${elapsedSec}s)...`;
            if (btnRunStandardizeFill) btnRunStandardizeFill.style.width = '25%';
          } else if (numSec < 6) {
            if (btnRunStandardizeText) btnRunStandardizeText.innerText = `Analyzing & reasoning (${elapsedSec}s)...`;
            if (btnRunStandardizeFill) btnRunStandardizeFill.style.width = '50%';
          } else {
            if (btnRunStandardizeText) btnRunStandardizeText.innerText = `Synthesizing CAG markdown (${elapsedSec}s)...`;
            if (btnRunStandardizeFill) btnRunStandardizeFill.style.width = '75%';
          }
        } else {
          const estTokens = estimateIndonesianTokens(stdMarkdownOutput ? stdMarkdownOutput.value : '');
          if (btnRunStandardizeText) {
            btnRunStandardizeText.innerText = `Streaming: ~${estTokens.toLocaleString('en-US')} tokens (${elapsedSec}s)...`;
          }
          if (btnRunStandardizeFill) {
            btnRunStandardizeFill.style.width = '90%';
          }
        }
      }, 100);

      try {
        const res = await fetch('/api/standardize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawMarkdown: rawText,
            doc_type: convertDocType ? convertDocType.value : 'Training Module / Documentation',
            topic: convertTopic ? convertTopic.value.trim() : '',
            department: '',
            enableRoleBlock: convertEnableRoleblock ? convertEnableRoleblock.checked : false,
            model: convertModelSelect ? convertModelSelect.value : undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        if (!res.body) throw new Error('No response stream received');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          firstChunkReceived = true;
          const chunkStr = decoder.decode(value, { stream: true });
          totalReceivedChars += chunkStr.length;

          if (stdMarkdownOutput) {
            stdMarkdownOutput.value += chunkStr;
            updateStdMetrics();
          }
        }

        // On success: fill 100% and show complete
        if (btnRunStandardizeFill) btnRunStandardizeFill.style.width = '100%';
        if (btnRunStandardizeSpinner) btnRunStandardizeSpinner.classList.add('hidden');
        if (btnRunStandardizeText) btnRunStandardizeText.innerText = '✓ Standardization Complete!';
        notify('Standardization complete!');
      } catch (err: any) {
        notify(`Standardization failed: ${err.message}`, false);
        if (btnRunStandardizeSpinner) btnRunStandardizeSpinner.classList.add('hidden');
        if (btnRunStandardizeText) btnRunStandardizeText.innerText = `Failed: ${err.message}`;
        if (btnRunStandardizeFill) {
          btnRunStandardizeFill.style.width = '100%';
          btnRunStandardizeFill.className = "absolute left-0 top-0 bottom-0 bg-rose-600 transition-all duration-300 ease-out pointer-events-none";
        }
      } finally {
        clearInterval(progressTimer);
        isStandardizing = false;

        setTimeout(() => {
          updateStandardizeBtnState();
        }, 2000);
      }
    });
  }

  if (btnCopyStd) {
    btnCopyStd.addEventListener('click', () => {
      const val = stdMarkdownOutput ? stdMarkdownOutput.value : '';
      if (!val) return notify('Nothing to copy.', false);
      navigator.clipboard.writeText(val);
      notify('Standardized Markdown copied to clipboard!');
    });
  }

  if (btnDownloadStd) {
    btnDownloadStd.addEventListener('click', () => {
      const val = stdMarkdownOutput ? stdMarkdownOutput.value : '';
      if (!val) return notify('Nothing to download.', false);
      const filename = `${(convertTopic && convertTopic.value.trim() ? convertTopic.value.trim() : 'standardized_doc').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`;
      const blob = new Blob([val], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Downloaded ${filename}`);
    });
  }
}
