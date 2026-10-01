import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async () => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  try {
    const res = await fetch(`${backendUrl}/admin/courses/summary`, {
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch course summary', total: 0, active: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
