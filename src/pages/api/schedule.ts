import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async () => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  try {
    const res = await fetch(`${backendUrl}/admin/spreadsheet/schedule`, {
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (res.status === 404) {
      return new Response(JSON.stringify({
        enabled: false,
        schedule_type: 'daily',
        hour: 2,
        minute: 0,
        day_of_week: 1,
        last_run_at: null,
        last_status: 'BACKEND_NOT_DEPLOYED',
        last_result: null,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      enabled: false,
      schedule_type: 'daily',
      hour: 2,
      last_status: 'OFFLINE',
      error: err.message || 'Failed to fetch schedule',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  try {
    const body = await request.json();
    const res = await fetch(`${backendUrl}/admin/spreadsheet/schedule`, {
      method: 'POST',
      headers: {
        'X-API-Key': adminKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to update schedule' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
