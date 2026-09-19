import type { APIRoute } from 'astro';
import { LLAMA_CLOUD_API_KEY } from 'astro:env/server';
import { filterNoise } from '../../../lib/noise-filter';

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
    const res = await fetch(`${LLAMAPARSE_BASE_URL}/api/v1/parsing/job/${encodeURIComponent(jobId)}/result/markdown`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `LlamaParse result error (${res.status}): ${errText}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = (await res.json()) as { markdown?: string; text?: string };
    const rawMarkdown = data.markdown ?? data.text ?? '';
    const { cleaned, stats } = filterNoise(rawMarkdown);

    return new Response(JSON.stringify({ markdown: cleaned, raw: rawMarkdown, stats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch result' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
