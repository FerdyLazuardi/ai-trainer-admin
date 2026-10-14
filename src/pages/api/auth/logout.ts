// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';
import { SESSION_COOKIE_NAME } from '../../../lib/auth';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return redirect('/login?logout=1');
};

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
