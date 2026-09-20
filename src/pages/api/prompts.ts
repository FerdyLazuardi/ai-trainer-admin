// src/pages/api/prompts.ts
import type { APIRoute } from 'astro';
import { BACKEND_API_URL, ADMIN_API_KEY } from 'astro:env/server';
import { PROMPT_BLOCKS, SYSTEM_PROMPTS, PIPELINE_CONTEXT_BLOCKS, PIPELINE_ASSEMBLY_FRAME } from '../../data/prompts';

export const GET: APIRoute = async () => {
  const backendUrl = (BACKEND_API_URL || 'https://ai-trainer.lifeatamartha.com/api/v1').replace(/\/+$/, '');
  const adminKey = ADMIN_API_KEY || 'Amartha_Dashboard_Secret_Key_2026!';

  // 1. Attempt dynamic live fetch from cag-lms-agent backend
  try {
    const res = await fetch(`${backendUrl}/admin/prompts`, {
      headers: {
        'X-API-Key': adminKey,
      },
    });

    if (res.ok) {
      const liveData = await res.json();
      return new Response(JSON.stringify(liveData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    } else {
      console.warn(`Backend /admin/prompts returned status ${res.status}`);
    }
  } catch (err) {
    console.warn('Backend /admin/prompts fetch failed:', err);
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
      prompts_py: {
        file: 'app/llm/prompts.py',
        prompts: SYSTEM_PROMPTS,
        blocks: PROMPT_BLOCKS,
      },
      pipeline_py: {
        file: 'app/graph/pipeline.py',
        assembly_frame: PIPELINE_ASSEMBLY_FRAME,
        blocks: PIPELINE_CONTEXT_BLOCKS,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
};
