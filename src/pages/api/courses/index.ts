import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '25';
  const search = url.searchParams.get('search') || '';
  const category = url.searchParams.get('category') || '';
  const status = url.searchParams.get('status') || '';

  let targetUrl = `${backendUrl}/admin/courses?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
  if (search) targetUrl += `&search=${encodeURIComponent(search)}`;
  if (category) targetUrl += `&category=${encodeURIComponent(category)}`;
  if (status) targetUrl += `&status=${encodeURIComponent(status)}`;

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.detail || err.message || `HTTP ${res.status}`, total: 0, courses: [], categories: [] }), {
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch courses', total: 0, courses: [], categories: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
