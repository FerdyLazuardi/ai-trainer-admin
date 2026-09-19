import type { APIRoute } from 'astro';

export const TARGET_MODELS = [
  // OpenCode Models (Image 1)
  { id: 'oc/mimo-v2.5-free', name: 'oc/mimo-v2.5-free (Default)', provider: 'OpenCode', isDefault: true },
  { id: 'oc/big-pickle', name: 'oc/big-pickle', provider: 'OpenCode' },
  { id: 'oc/jev-1.13-free', name: 'oc/jev-1.13-free', provider: 'OpenCode' },
  { id: 'oc/ling-3.0-flash-fin-free', name: 'oc/ling-3.0-flash-fin-free', provider: 'OpenCode' },
  { id: 'oc/nemotron-3-ultra-free', name: 'oc/nemotron-3-ultra-free', provider: 'OpenCode' },
  { id: 'oc/nemotron-3.5-lightning-free', name: 'oc/nemotron-3.5-lightning-free', provider: 'OpenCode' },
  { id: 'oc/muse-spark-1.2-contributor-free', name: 'oc/muse-spark-1.2-contributor-free', provider: 'OpenCode' },
  { id: 'oc/muse-spark-1.3-contributor-free', name: 'oc/muse-spark-1.3-contributor-free', provider: 'OpenCode' },

  // OpenRouter Models (Image 2)
  { id: 'openrouter/deepseek/deepseek-v4-flash-0731:free', name: 'openrouter/deepseek/deepseek-v4-flash-0731:free', provider: 'OpenRouter' },
  { id: 'openrouter/deepseek/deepseek-v4.1-flash', name: 'openrouter/deepseek/deepseek-v4.1-flash', provider: 'OpenRouter' },
];

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      models: TARGET_MODELS,
      defaultModel: 'oc/mimo-v2.5-free',
      total: TARGET_MODELS.length,
      source: 'curated',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
