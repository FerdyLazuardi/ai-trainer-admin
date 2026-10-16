import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async () => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  try {
    const res = await fetch(`${backendUrl}/admin/history/summary`, {
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fallback: try querying /admin/spreadsheet/history with limit=1 to get total
    const fallbackRes = await fetch(`${backendUrl}/admin/spreadsheet/history?page=1&limit=1`, {
      headers: { 'X-API-Key': adminKey },
    });
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      const total = fbData.total ?? fbData.row_count ?? fbData.history_total ?? 0;
      return new Response(JSON.stringify({ total, active: total }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ total: 0, active: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ total: 0, active: 0, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
