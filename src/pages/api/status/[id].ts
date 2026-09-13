import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing job ID' }), { status: 400 });
  }

  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  try {
    const res = await fetch(`${backendUrl}/ingest/spreadsheet/status/${id}`, {
      method: 'GET',
      headers: {
        'X-API-Key': adminKey,
      },
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch status' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
