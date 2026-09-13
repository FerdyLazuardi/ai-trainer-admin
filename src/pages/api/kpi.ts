import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY, SPREADSHEET_SYNC_URL, SPREADSHEET_SYNC_TOKEN } from 'astro:env/server';

// In-memory cache for fast paging & searching (TTL 60s)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60_000;

export const GET: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';
  const gasUrl = SPREADSHEET_SYNC_URL || 'https://script.google.com/macros/s/AKfycbwXqV2YPmdcU6PmHVqdEA3edLBd-ZSoYfvTE6cCEfgDszVIRD-rUH3mrNBWooN8MvhXOg/exec';
  const token = SPREADSHEET_SYNC_TOKEN || 'amartha_secret_kpi_token_2026';

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'users';
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '50';
  const search = url.searchParams.get('search') || '';
  const cacheKey = `${scope}:${page}:${limit}:${search}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cached.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
      },
    });
  }

  // 1. Primary Path: Query PostgreSQL on Proxmox Backend
  try {
    let pgEndpoint = `${backendUrl}/admin/spreadsheet/${scope}?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
    if (search) {
      pgEndpoint += `&search=${encodeURIComponent(search)}`;
    }

    const pgRes = await fetch(pgEndpoint, {
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (pgRes.ok) {
      const data = await pgRes.json();
      data.source = 'postgresql';
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-DataSource': 'PostgreSQL-Proxmox',
        },
      });
    }
  } catch (pgErr) {
    console.warn('PostgreSQL fetch fallback to GAS:', pgErr);
  }

  // 2. Fallback Path: Google Apps Script API (if backend route not yet deployed)
  try {
    const targetUrl = `${gasUrl}?token=${encodeURIComponent(token)}&scope=${encodeURIComponent(scope)}&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
    const res = await fetch(targetUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`GAS returned status ${res.status}`);
    }

    const data = await res.json();
    data.source = 'google_apps_script';
    cache.set(cacheKey, { data, timestamp: Date.now() });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-DataSource': 'GoogleAppsScript-Fallback',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch KPI data' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
