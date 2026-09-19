// src/pages/api/prompts.ts
import type { APIRoute } from 'astro';
import { PROMPT_BLOCKS, SYSTEM_PROMPTS } from '../../data/prompts';

export const GET: APIRoute = async () => {
  try {
    return new Response(
      JSON.stringify({
        success: true,
        total_prompts: SYSTEM_PROMPTS.length,
        total_blocks: PROMPT_BLOCKS.length,
        prompts: SYSTEM_PROMPTS,
        blocks: PROMPT_BLOCKS,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Failed to retrieve system prompts',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
