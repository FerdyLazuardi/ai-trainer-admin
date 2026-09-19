// src/scripts/utils.ts

export let USD_TO_IDR = 17600.0;

/**
 * Realistic token estimator for Indonesian text + Markdown structures.
 * Indonesian morphology splits into ~2.2 subwords/word on BPE tokenizers (cl100k_base).
 * Tables and markdown syntax average ~2.9 chars/token.
 */
export function estimateIndonesianTokens(text: string): number {
  if (!text || !text.trim()) return 0;
  const words = text.trim().split(/\s+/).length;
  const byWords = words * 2.2;
  const byChars = text.length / 2.9;
  return Math.round((byWords + byChars) / 2);
}

export async function initExchangeRate(onUpdated?: (rate: number) => void) {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.IDR) {
        USD_TO_IDR = Number(data.rates.IDR);
        if (onUpdated) onUpdated(USD_TO_IDR);
      }
    }
  } catch (e) {
    console.warn('Exchange rate fetch error:', e);
  }
}

export function notify(message: string, isSuccess = true) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');
  if (!toast || !toastMsg || !toastIcon) return;

  toastMsg.innerText = message;
  toastIcon.innerText = isSuccess ? '⚡' : '⚠️';
  toast.classList.remove('translate-y-12', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-12', 'opacity-0');
  }, 3500);
}

export function initClock() {
  const wibClock = document.getElementById('wib-clock');
  if (!wibClock) return;

  function updateClock() {
    const now = new Date();
    wibClock!.innerText = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false
    }) + ' WIB';
  }
  setInterval(updateClock, 1000);
  updateClock();
}

export function escapeHtml(str: any): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB';
  } catch {
    return iso;
  }
}

export function formatTimeNumeric(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const parts = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const getPart = (t: string) => parts.find(p => p.type === t)?.value || '';
    return `${getPart('day')}/${getPart('month')}/${getPart('year')} ${getPart('hour')}:${getPart('minute')}`;
  } catch {
    return iso;
  }
}

export function openDetailModal(title: string, subtitle: string, contentHtml: string) {
  const detailModal = document.getElementById('detail-modal') as HTMLDialogElement | null;
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalContent = document.getElementById('modal-content');

  if (!detailModal || !modalTitle || !modalSubtitle || !modalContent) return;
  modalTitle.innerText = title;
  modalSubtitle.innerText = subtitle;
  modalContent.innerHTML = contentHtml;
  detailModal.showModal();
}

export function initDetailModal() {
  const detailModal = document.getElementById('detail-modal') as HTMLDialogElement | null;
  const modalClose = document.getElementById('modal-close');
  if (modalClose && detailModal) {
    modalClose.addEventListener('click', () => detailModal.close());
  }
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) detailModal.close();
    });
  }
}
