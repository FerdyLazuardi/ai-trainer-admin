// src/scripts/courses.ts
import { notify, escapeHtml } from './utils';

export interface CourseItem {
  id: number;
  fullname: string;
  category: string;
  status: string;
  url: string;
  updated_at?: string;
}

export let coursePage = 1;
export const COURSE_LIMIT = 20;
export let courseSearchQuery = '';
export let courseCategoryFilter = 'ALL';
export let totalCourses = 0;
export let coursesLoaded = false;
let courseSearchDebounce: ReturnType<typeof setTimeout> | null = null;

export async function loadCourses(page = 1) {
  coursePage = page;
  const tbody = document.getElementById('courses-table-rows');
  const badge = document.getElementById('courses-count-badge');
  const pageNum = document.getElementById('courses-page-number');
  const paginationInfo = document.getElementById('courses-pagination-info');
  const btnPrev = document.getElementById('btn-course-prev') as HTMLButtonElement | null;
  const btnNext = document.getElementById('btn-course-next') as HTMLButtonElement | null;
  const btnRefresh = document.getElementById('btn-course-refresh') as HTMLButtonElement | null;
  const categorySelect = document.getElementById('course-category-filter') as HTMLSelectElement | null;

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400 text-xs">Loading courses from PostgreSQL...</td></tr>`;
  }
  if (btnRefresh) btnRefresh.disabled = true;

  try {
    const params = new URLSearchParams({
      page: String(coursePage),
      limit: String(COURSE_LIMIT),
    });
    if (courseSearchQuery.trim()) {
      params.set('search', courseSearchQuery.trim());
    }
    if (courseCategoryFilter && courseCategoryFilter !== 'ALL') {
      params.set('category', courseCategoryFilter);
    }

    const res = await fetch(`/api/courses?${params.toString()}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const courses: CourseItem[] = data.courses || [];
    totalCourses = data.total || 0;
    const categories: string[] = data.categories || [];

    // Populate category dropdown options if not already filled
    if (categorySelect && categories.length > 0 && categorySelect.options.length <= 1) {
      categories.forEach(cat => {
        if (!cat) return;
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });
      if (courseCategoryFilter && courseCategoryFilter !== 'ALL') {
        categorySelect.value = courseCategoryFilter;
      }
    }

    if (badge) {
      badge.textContent = `${totalCourses.toLocaleString('id-ID')} Courses`;
    }

    // Render table rows with clean minimalist styling
    if (tbody) {
      if (courses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-gray-400 text-xs">No courses found matching filter.</td></tr>`;
      } else {
        tbody.innerHTML = courses.map(c => {
          const link = c.url
            ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 transition-colors font-medium">Open <span class="text-[10px]">↗</span></a>`
            : `<span class="text-gray-300">—</span>`;

          return `
            <tr class="hover:bg-gray-50/60 transition-colors">
              <td class="py-3 px-4 font-mono text-[11px] text-gray-400">#${c.id}</td>
              <td class="py-3 px-4 font-medium text-gray-900 text-xs sm:text-sm">${escapeHtml(c.fullname)}</td>
              <td class="py-3 px-4">
                <span class="inline-block px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[11px] max-w-[200px] truncate" title="${escapeHtml(c.category || '-')}">
                  ${escapeHtml(c.category || '-')}
                </span>
              </td>
              <td class="py-3 px-4 text-right">${link}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Update pagination controls
    const totalPages = Math.ceil(totalCourses / COURSE_LIMIT) || 1;
    if (pageNum) pageNum.textContent = String(coursePage);
    if (paginationInfo) {
      const start = totalCourses === 0 ? 0 : (coursePage - 1) * COURSE_LIMIT + 1;
      const end = Math.min(coursePage * COURSE_LIMIT, totalCourses);
      paginationInfo.textContent = `Showing ${start}-${end} of ${totalCourses}`;
    }

    if (btnPrev) btnPrev.disabled = coursePage <= 1;
    if (btnNext) btnNext.disabled = coursePage >= totalPages;

    coursesLoaded = true;
  } catch (err: any) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-500 text-xs">Failed to load courses: ${escapeHtml(err.message)}</td></tr>`;
    }
    if (badge) badge.textContent = 'Error';
    notify(`Failed to load courses: ${err.message}`, false);
  } finally {
    if (btnRefresh) btnRefresh.disabled = false;
  }
}

export function initCoursesTab() {
  const courseSearchInput = document.getElementById('course-search-input') as HTMLInputElement | null;
  const courseCategoryFilterEl = document.getElementById('course-category-filter') as HTMLSelectElement | null;
  const btnCourseRefresh = document.getElementById('btn-course-refresh');
  const btnCoursePrev = document.getElementById('btn-course-prev');
  const btnCourseNext = document.getElementById('btn-course-next');

  if (courseSearchInput) {
    courseSearchInput.addEventListener('input', () => {
      if (courseSearchDebounce) clearTimeout(courseSearchDebounce);
      courseSearchDebounce = setTimeout(() => {
        courseSearchQuery = courseSearchInput.value.trim();
        loadCourses(1);
      }, 300);
    });
  }

  if (courseCategoryFilterEl) {
    courseCategoryFilterEl.addEventListener('change', () => {
      courseCategoryFilter = courseCategoryFilterEl.value;
      loadCourses(1);
    });
  }

  if (btnCourseRefresh) {
    btnCourseRefresh.addEventListener('click', () => {
      loadCourses(coursePage);
    });
  }

  if (btnCoursePrev) {
    btnCoursePrev.addEventListener('click', () => {
      if (coursePage > 1) {
        loadCourses(coursePage - 1);
      }
    });
  }

  if (btnCourseNext) {
    btnCourseNext.addEventListener('click', () => {
      const totalPages = Math.ceil(totalCourses / COURSE_LIMIT) || 1;
      if (coursePage < totalPages) {
        loadCourses(coursePage + 1);
      }
    });
  }
}
