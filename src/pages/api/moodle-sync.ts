import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';

export const POST: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  let body = {
    course_id: 3,
    target_sections: null,
    force_reingest: true,
  };

  try {
    const raw = await request.json();
    body = { ...body, ...raw };
  } catch {
    // default body
  }

  try {
    const res = await fetch(`${backendUrl}/ingest/moodle/sync`, {
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to trigger Moodle sync' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async ({ request }) => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  const url = new URL(request.url);
  const courseId = url.searchParams.get('course_id') || '3';

  try {
    const res = await fetch(`${backendUrl}/moodle/sections?course_id=${encodeURIComponent(courseId)}`, {
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
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch Moodle sections' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
