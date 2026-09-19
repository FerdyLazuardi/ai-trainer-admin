import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async () => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  try {
    const res = await fetch(`${backendUrl}/admin/kb`, {
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch active KB from backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
