import type { APIRoute } from 'astro';
import { LLAMA_CLOUD_API_KEY } from 'astro:env/server';

const LLAMAPARSE_BASE_URL = 'https://api.cloud.llamaindex.ai';
const DEFAULT_PARSING_INSTRUCTION = `You are a precision document parser converting presentation slide decks into clean, well-structured Markdown.

Follow these strict rules:

1. Multi-Column & Card Layouts:
   - When a slide has side-by-side cards, columns, or comparison blocks:
     Process each card/column independently and completely: output the column heading, followed immediately by its own body paragraph.
   - NEVER group all column headings together at the top.
   - NEVER merge text from different columns/cards together.

2. Illustrations, Graphics & Clipart (CRITICAL):
   - Completely IGNORE all decorative cartoon illustrations, cliparts, drawings, people graphics, and icons.
   - DO NOT transcribe or run OCR on text drawn inside cartoon pictures (for example, ignore words written on background whiteboards, flipcharts, signs, or shirts like "PILOT PROJECT").
   - Extract ONLY the actual document text written in native presentation text boxes.

3. Paragraphs vs Lists:
   - Keep natural paragraphs intact as paragraphs. DO NOT convert normal sentences or multiple cards into an artificial numbered list (1, 2, 3, 4, 5).
   - Only use numbered lists if the original slide explicitly used numbered points.
   - If bullet points were used in the slide, keep them as Markdown bullets (-).

4. Clean Markdown Hierarchy:
   - Slide Title becomes Markdown H1 (#).
   - Core principle statement or quote becomes a blockquote (>) or paragraph below the title.
   - Card/Section headings become Markdown H2 (##).
   - Strip all footers, page numbers, confidentiality watermarks ("CONFIDENTIAL", "For Greater Purpose", "Page X of Y").
   - Do NOT emit raw HTML tags (like <u> or <font>) or HTML entities (use & instead of &#x26;).`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = LLAMA_CLOUD_API_KEY || process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LLAMA_CLOUD_API_KEY is not configured in server environment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const instruction = (formData.get('parsing_instruction') as string) || DEFAULT_PARSING_INSTRUCTION;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const llamaFormData = new FormData();
    llamaFormData.append('file', file, file.name);
    llamaFormData.append('parsing_instruction', instruction);
    llamaFormData.append('result_type', 'markdown');
    llamaFormData.append('disable_ocr', 'true');
    llamaFormData.append('ignore_text_in_image', 'true');
    llamaFormData.append('skip_diagonal_text', 'true');

    const res = await fetch(`${LLAMAPARSE_BASE_URL}/api/v1/parsing/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: llamaFormData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `LlamaParse error (${res.status}): ${errText}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = (await res.json()) as { id: string };
    return new Response(JSON.stringify({ job_id: data.id, filename: file.name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to initiate parse job' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
