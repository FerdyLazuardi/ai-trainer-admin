import type { APIRoute } from 'astro';
import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } from 'astro:env/server';
import { ASKFER_RAG_STANDARDIZER_SYSTEM_PROMPT } from '../../lib/standardizer-prompt';

function buildUserMessage(i: {
  rawMarkdown: string;
  doc_type?: string;
  topic?: string;
  department?: string;
  course_name?: string;
  enableRoleBlock?: boolean;
}): string {
  const docType = i.doc_type || i.topic || 'Training Module / Documentation';
  const roleBlockSection = i.enableRoleBlock !== true
    ? `## ROLE BLOCK DIRECTIVE (CRITICAL — ROLE BLOCKS DISABLED)
The user has EXPLICITLY DISABLED role block tagging for this document.
- DO NOT use <role_block> or </role_block> tags anywhere in the output!
- Write all role duties (BP, BM, AM, RM, HO) using standard Markdown headings or standard bullet points without any XML wrapper tags.
- Do NOT output any XML tags.`
    : `## ROLE BLOCK DIRECTIVE
Wrap dedicated tasks, duties, and responsibilities for specific roles (BP, BM, AM, RM, HMB, HO) inside <role_block roles="..."> ... </role_block> tags as specified in the system prompt.`;

  return `Convert the raw markdown below into CAG-optimized markdown for context caching.

Document Type to apply: **${docType}**
(Templates: "Training Module / Documentation" | "Script / Roleplay Dialogue")

Strict rules:
- Output ONLY the final standardized markdown. NO commentary, NO code fences (\`\`\`). Do NOT include YAML frontmatter.
- Use \`# [Main Title]\` EXCLUSIVELY once at the very top for the document title. Never use \`#\` anywhere else.
- Immediately start with the first \`## [Section]\`. Do NOT add generic intro paragraphs under \`# [Main Title]\`.
- ZERO filler words or transition sentences (NEVER write "Berikut adalah rincian...", "Berikut adalah langkah-langkah...", "Dokumen ini membahas..."). Go straight to the point.
- NO redundant fragmented headings for sub-items or examples belonging to the same topic. Keep the primary topic as \`## [Section Name]\` and present sub-items as bold bullet points: \`* **[Label]:** [Detail]\`.
- Apply the matching document-type template.
- Adhere to all core principles + the self-check.

${roleBlockSection}

## LANGUAGE PRESERVATION (CRITICAL — failures here are unacceptable)

Write the ENTIRE standardized markdown — including every heading, every paragraph, every bullet — in the SAME natural language as the source raw markdown below.

- If the source is Bahasa Indonesia → output 100% Bahasa Indonesia. Every word.
- If the source mixes languages → follow the DOMINANT language of the source body content.
- **NEVER translate any part to English.**
- Self-check before outputting: scan every heading and paragraph. If you see English template words and the source is Indonesian, replace them with natural Indonesian.

<raw_markdown>
${i.rawMarkdown}
</raw_markdown>
`;
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = LLM_API_KEY || process.env.LLM_API_KEY || '123456';
  const baseUrl = LLM_BASE_URL || process.env.LLM_BASE_URL || 'http://localhost:20128/v1';

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawMarkdown = body.rawMarkdown || '';
  if (!rawMarkdown.trim()) {
    return new Response(JSON.stringify({ error: 'rawMarkdown cannot be empty' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const enableRoleBlock = body.enableRoleBlock === true;
  let systemPrompt = ASKFER_RAG_STANDARDIZER_SYSTEM_PROMPT;
  if (!enableRoleBlock) {
    systemPrompt = systemPrompt.replace(
      /6\.\s+\*\*MANDATORY Role Block Scoping[\s\S]*?(?=\n\n---\s*\n\s*##\s*2\.)/,
      '6. **Role Block Scoping Disabled:** DO NOT wrap content inside `<role_block>` or `</role_block>` tags. Present all roles as clean, standard Markdown text and bullet points without XML tags.'
    );
  }

  const userMsg = buildUserMessage(body);
  const selectedModel = body.model || LLM_MODEL || process.env.LLM_MODEL || 'oc/mimo-v2.5-free';

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        stream: true,
        temperature: 0,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return new Response(JSON.stringify({ error: `LLM API Error (${upstream.status}): ${errText}` }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!upstream.body) {
      return new Response(JSON.stringify({ error: 'No upstream response body' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Transform SSE chunks to simple text stream
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) {
                  controller.enqueue(encoder.encode(`\n\n> [!WARNING] Model Error: ${parsed.error.message || JSON.stringify(parsed.error)}\nSilakan coba ganti model lain di pilihan dropdown.\n`));
                  continue;
                }
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(encoder.encode(delta));
                }
              } catch {
                // Ignore incomplete json lines
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'LLM standardization failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
