import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit') || '500';
  const cursor = url.searchParams.get('cursor') || '';

  let targetUrl = `${backendUrl}/admin/logs?limit=${encodeURIComponent(limit)}`;
  if (cursor) {
    targetUrl += `&cursor=${encodeURIComponent(cursor)}`;
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(errText, {
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch logs from backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
