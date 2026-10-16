import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';

  let targetUrl = `${backendUrl}/admin/spreadsheet/history?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
  if (search) {
    targetUrl += `&search=${encodeURIComponent(search)}`;
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.detail || err.message || `HTTP ${res.status}`, records: [] }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch history', records: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
