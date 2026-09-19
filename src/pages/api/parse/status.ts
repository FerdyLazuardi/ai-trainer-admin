import type { APIRoute } from 'astro';
import { LLAMA_CLOUD_API_KEY } from 'astro:env/server';

const LLAMAPARSE_BASE_URL = 'https://api.cloud.llamaindex.ai';

export const GET: APIRoute = async ({ request }) => {
  const apiKey = LLAMA_CLOUD_API_KEY || process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LLAMA_CLOUD_API_KEY is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get('job_id');
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing job_id parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(`${LLAMAPARSE_BASE_URL}/api/v1/parsing/job/${encodeURIComponent(jobId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `LlamaParse status error (${res.status}): ${errText}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ status: data.status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to check status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
