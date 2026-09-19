// src/pages/api/prompts.ts
import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';
import { PROMPT_BLOCKS, SYSTEM_PROMPTS } from '../../data/prompts';

export const GET: APIRoute = async () => {
  const backendUrl = BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1';
  const adminKey = ADMIN_API_KEY || '';

  // 1. Attempt dynamic live fetch from cag-lms-agent backend
  try {
    const res = await fetch(`${backendUrl}/admin/prompts`, {
      headers: {
        'X-API-Key': adminKey,
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const liveData = await res.json();
      return new Response(JSON.stringify(liveData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }
  } catch (err) {
    console.warn('Backend /admin/prompts fetch failed or timed out, using local fallback:', err);
  }

  // 2. Fallback to local snapshot if backend is offline/unreachable
  return new Response(
    JSON.stringify({
      success: true,
      source: 'local_fallback',
      total_prompts: SYSTEM_PROMPTS.length,
      total_blocks: PROMPT_BLOCKS.length,
      prompts: SYSTEM_PROMPTS,
      blocks: PROMPT_BLOCKS,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
};
