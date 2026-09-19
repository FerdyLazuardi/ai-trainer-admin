// src/scripts/kpi.ts
import { notify, openDetailModal } from './utils';

export let rawKPIRows: any[] = [];
export let kpiPage = 1;

const ROLE_NAMES: Record<string, string> = {
  BP: 'Business Partner',
  BM: 'Business Manager',
  AM: 'Area Manager',
  RM: 'Regional Manager',
  HMB: 'Head of Micro Business',
  'Head HMB': 'Head of Micro Business',
  'HEAD HMB': 'Head of Micro Business',
  HO: 'Head Office',
  HQ: 'Headquarters',
};

export async function loadKPIData(page = 1) {
  kpiPage = page;
  const kpiTotalBadge = document.getElementById('kpi-total-badge');
  const kpiTableRows = document.getElementById('kpi-table-rows');
  const kpiSearchInput = document.getElementById('kpi-search-input') as HTMLInputElement | null;
  const kpiRoleFilter = document.getElementById('kpi-role-filter') as HTMLSelectElement | null;
  const kpiTargetRoles = document.getElementById('kpi-target-roles');
  const kpiTargetSubtitle = document.getElementById('kpi-target-subtitle');
  const btnKpiPrev = document.getElementById('btn-kpi-prev') as HTMLButtonElement | null;
  const kpiCurrentPage = document.getElementById('kpi-current-page');
  const kpiPageIndicator = document.getElementById('kpi-page-indicator');

  if (kpiCurrentPage) kpiCurrentPage.innerText = String(page);
  if (btnKpiPrev) btnKpiPrev.disabled = page <= 1;

  const q = (kpiSearchInput?.value || '').trim();
  const roleFilter = kpiRoleFilter ? kpiRoleFilter.value : 'ALL';

  try {
    if (kpiTableRows) {
      kpiTableRows.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400">Loading records from PostgreSQL...</td></tr>`;
    }
    let url = `/api/kpi?scope=users&page=${page}&limit=50`;
    if (q) url += `&search=${encodeURIComponent(q)}`;
    if (roleFilter !== 'ALL') url += `&role=${encodeURIComponent(roleFilter)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const users = data.users || (Array.isArray(data) ? data : []);
    rawKPIRows = users;

    const total = data.total ?? data.users_total ?? users.length;
    if (kpiTotalBadge) kpiTotalBadge.innerText = Number(total).toLocaleString('id-ID');
    if (kpiPageIndicator) {
      kpiPageIndicator.innerText = `Showing Page ${page} (${users.length} of ${Number(total).toLocaleString('id-ID')} records)`;
    }

    if (data.role_counts && Object.keys(data.role_counts).length > 0) {
      const roleEntries = Object.entries(data.role_counts).filter(([r]) => r && r !== 'UNKNOWN');
      
      if (roleEntries.length > 0 && kpiTargetRoles) {
        kpiTargetRoles.innerHTML = roleEntries.map(([r, c]) => `
          <button
            type="button"
            data-role-chip="${r}"
            class="role-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100/80 hover:bg-indigo-50 border border-gray-200/80 hover:border-indigo-300 text-xs font-bold text-gray-800 hover:text-indigo-700 transition-all cursor-pointer shadow-2xs group"
            title="Filter by ${r}"
          >
            <span class="text-indigo-600 font-extrabold group-hover:text-indigo-700">${r}</span>
            <span class="text-gray-500 font-semibold tabular-nums text-[11px] group-hover:text-indigo-600">(${Number(c).toLocaleString('id-ID')})</span>
          </button>
        `).join('');

        kpiTargetRoles.querySelectorAll('.role-chip').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const selectedRole = btn.getAttribute('data-role-chip');
            if (kpiRoleFilter && selectedRole) {
              kpiRoleFilter.value = selectedRole;
              loadKPIData(1);
            }
          });
        });
      }
      if (kpiTargetSubtitle) {
        kpiTargetSubtitle.innerText = `${roleEntries.length} Active Roles in Spreadsheet KPI • Click role to filter`;
      }

      if (kpiRoleFilter) {
        const currentSelected = kpiRoleFilter.value || 'ALL';
        const totalCountFormatted = Number(total).toLocaleString('id-ID');

        let optionsHtml = `<option value="ALL">All Roles (${totalCountFormatted})</option>`;
        roleEntries.forEach(([r, c]) => {
          const desc = ROLE_NAMES[r] ? ` (${ROLE_NAMES[r]})` : '';
          const countFormatted = Number(c).toLocaleString('id-ID');
          optionsHtml += `<option value="${r}">${r}${desc} - ${countFormatted}</option>`;
        });

        kpiRoleFilter.innerHTML = optionsHtml;
        if (roleEntries.some(([r]) => r === currentSelected)) {
          kpiRoleFilter.value = currentSelected;
        } else {
          kpiRoleFilter.value = 'ALL';
        }
      }
    } else if (users.length > 0 && kpiTargetRoles) {
      const uniqueRoles = [...new Set(users.map((u: any) => u.role || u.position).filter(Boolean))];
      if (uniqueRoles.length > 0) {
        kpiTargetRoles.innerHTML = uniqueRoles.map(r => `
          <span class="inline-flex items-center px-2 py-0.5 rounded-lg bg-gray-100 border border-gray-200 text-xs font-bold text-gray-800">
            <span class="text-indigo-600 font-extrabold">${r}</span>
          </span>
        `).join('');
      }
    }
    
    renderKPITable();

  } catch (err: any) {
    console.error('Failed to load KPI data:', err);
    if (kpiTableRows) {
      kpiTableRows.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-600 font-mono">Error loading PostgreSQL KPI: ${err.message}</td></tr>`;
    }
  }
}

export function renderKPITable() {
  const kpiTableRows = document.getElementById('kpi-table-rows');
  const kpiRoleFilter = document.getElementById('kpi-role-filter') as HTMLSelectElement | null;
  if (!kpiTableRows) return;

  const roleFilter = kpiRoleFilter ? kpiRoleFilter.value : 'ALL';
  const roleUpper = String(roleFilter || '').trim().toUpperCase();

  const filtered = rawKPIRows.filter(row => {
    if (roleUpper !== 'ALL') {
      const r = String(row.role || row.position || '').trim().toUpperCase();
      if (r !== roleUpper && !r.includes(roleUpper)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    kpiTableRows.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-gray-400">No matching employees found on this page.</td></tr>`;
    return;
  }

  kpiTableRows.innerHTML = filtered.map((row, idx) => {
    const skor = row['Skor KPI'] || row.skor_kpi || '—';
    const status = row['KPI Status'] || row.kpi_status || 'Need Improvement';
    const sLower = String(status).toLowerCase();

    let badgeClass = 'bg-amber-50 text-amber-700 border border-amber-200';
    let dotClass = 'bg-amber-500';
    let skorClass = 'text-gray-900';

    if (sLower.includes('exceed')) {
      badgeClass = 'bg-purple-50 text-purple-700 border border-purple-200 font-semibold';
      dotClass = 'bg-purple-500';
      skorClass = 'text-purple-600 font-bold';
    } else if (sLower.includes('achieve')) {
      badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold';
      dotClass = 'bg-emerald-500';
      skorClass = 'text-emerald-600 font-bold';
    }

    return `
      <tr data-kpi-index="${idx}" class="kpi-row hover:bg-gray-50/80 transition-colors cursor-pointer group">
        <td class="py-3 px-4 font-bold text-gray-900 font-mono group-hover:text-black transition-colors">${row.username || '—'}</td>
        <td class="py-3 px-4 text-gray-900 font-semibold">${row.full_name || '—'}</td>
        <td class="py-3 px-4">
          <span class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            ${row.role || row.position || 'BP'}
          </span>
        </td>
        <td class="py-3 px-4 text-gray-600">${row.point || '—'}</td>
        <td class="py-3 px-4 text-gray-500">${row.area || ''} / ${row.regional || ''}</td>
        <td class="py-3 px-4 font-bold tabular-nums ${skorClass}">${skor}</td>
        <td class="py-3 px-4 text-right">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
            ${status}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.kpi-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const idx = parseInt(tr.getAttribute('data-kpi-index') || '0', 10);
      const row = filtered[idx];
      if (!row) return;

      const entries = Object.entries(row).filter(([k]) => k !== 'data');
      const highlights = [
        ['NIK / Username', row.username],
        ['Nama Lengkap', row.full_name],
        ['Jabatan', `${row.role || ''} - ${row.position || ''}`],
        ['Periode KPI', row.periode_kpi],
        ['Point / Cabang', row.point],
        ['Area & Regional', `${row.area || ''} / ${row.regional || ''} (${row.pulau || ''})`],
        ['Ranking', row.Ranking || '—'],
        ['Skor KPI', row['Skor KPI'] || '—'],
        ['Status KPI', row['KPI Status'] || '—'],
        ['Total Insentif', row['Total Insentif'] || '—'],
      ];

      const contentHtml = `
        <div class="space-y-4">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            ${highlights.map(([label, val]) => `
              <div class="p-3 rounded-2xl bg-gray-50 border border-gray-100">
                <span class="text-[10px] text-gray-400 font-bold uppercase">${label}</span>
                <div class="text-gray-900 font-bold text-xs truncate mt-0.5">${val || '—'}</div>
              </div>
            `).join('')}
          </div>

          <div class="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
            <div class="text-xs font-bold text-gray-800 uppercase text-[10px] tracking-wider">All Parameters in PostgreSQL</div>
            <div class="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs divide-y divide-gray-200/50">
              ${entries.map(([k, v]) => `
                <div class="flex items-center justify-between py-1.5">
                  <span class="text-gray-500 truncate max-w-[280px]">${k}</span>
                  <span class="text-gray-900 font-semibold tabular-nums font-mono">${String(v)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      openDetailModal(`Employee Record: ${row.full_name || row.username}`, `PostgreSQL user_kpi_data • ${row.role || 'Employee'}`, contentHtml);
    });
  });
}

export function initKpiTab() {
  const kpiRoleFilter = document.getElementById('kpi-role-filter');
  const btnReloadKpi = document.getElementById('btn-reload-kpi');
  const kpiSearchInput = document.getElementById('kpi-search-input');
  const btnDeleteAllKpi = document.getElementById('btn-delete-all-kpi');
  const confirmDeleteModal = document.getElementById('confirm-delete-kpi-modal') as HTMLDialogElement | null;
  const btnCancelDeleteKpi = document.getElementById('btn-cancel-delete-kpi');
  const btnConfirmDeleteKpi = document.getElementById('btn-confirm-delete-kpi') as HTMLButtonElement | null;
  const confirmDeleteBtnText = document.getElementById('confirm-delete-btn-text');
  const btnKpiPrev = document.getElementById('btn-kpi-prev');
  const btnKpiNext = document.getElementById('btn-kpi-next');
  const statUserCount = document.getElementById('stat-user-count');
  const kpiTotalBadge = document.getElementById('kpi-total-badge');

  if (kpiRoleFilter) kpiRoleFilter.addEventListener('change', () => loadKPIData(1));
  if (btnReloadKpi) btnReloadKpi.addEventListener('click', () => loadKPIData(1));
  if (kpiSearchInput) {
    kpiSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadKPIData(1);
    });
  }

  if (btnDeleteAllKpi && confirmDeleteModal) {
    btnDeleteAllKpi.addEventListener('click', () => {
      confirmDeleteModal.showModal();
    });
  }

  if (btnCancelDeleteKpi && confirmDeleteModal) {
    btnCancelDeleteKpi.addEventListener('click', () => {
      confirmDeleteModal.close();
    });
    confirmDeleteModal.addEventListener('click', (e) => {
      if (e.target === confirmDeleteModal) confirmDeleteModal.close();
    });
  }

  if (btnConfirmDeleteKpi) {
    btnConfirmDeleteKpi.addEventListener('click', async () => {
      const origText = confirmDeleteBtnText ? confirmDeleteBtnText.innerText : 'Yes, Delete All Data';
      btnConfirmDeleteKpi.disabled = true;
      if (confirmDeleteBtnText) confirmDeleteBtnText.innerText = 'Truncating DB...';

      try {
        const res = await fetch('/api/kpi', { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || `HTTP ${res.status}`);
        }
        if (confirmDeleteModal) confirmDeleteModal.close();
        notify(result.message || 'PostgreSQL tables truncated successfully.');
        rawKPIRows = [];
        if (kpiTotalBadge) kpiTotalBadge.innerText = '0';
        if (statUserCount) statUserCount.innerText = '0';
        await loadKPIData(1);
      } catch (err: any) {
        notify(`Failed to truncate records: ${err.message}`, false);
      } finally {
        btnConfirmDeleteKpi.disabled = false;
        if (confirmDeleteBtnText) confirmDeleteBtnText.innerText = origText;
      }
    });
  }

  if (btnKpiPrev) {
    btnKpiPrev.addEventListener('click', () => {
      if (kpiPage > 1) loadKPIData(kpiPage - 1);
    });
  }

  if (btnKpiNext) {
    btnKpiNext.addEventListener('click', () => {
      loadKPIData(kpiPage + 1);
    });
  }
}
