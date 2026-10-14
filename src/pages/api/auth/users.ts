// src/pages/api/auth/users.ts
import type { APIRoute } from 'astro';
import { AUTH_SECRET, SUPER_ADMIN_EMAILS } from 'astro:env/server';
import { verifySession, SESSION_COOKIE_NAME } from '../../../lib/auth';
import { listAllUsers } from '../../../lib/kv';

export const GET: APIRoute = async ({ cookies, locals }) => {
  const authSecret = AUTH_SECRET || (process.env.AUTH_SECRET ?? 'amartha_cag_secret_session_token_key_2026');
  const superAdmins = SUPER_ADMIN_EMAILS || (process.env.SUPER_ADMIN_EMAILS ?? 'ferdy.lazuardi@amartha.com,anggit.furqon@amartha.com');

  const cookieVal = cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(cookieVal, authSecret);

  if (!session || session.role !== 'ADMIN') {
    return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const users = await listAllUsers(locals, superAdmins);

  return new Response(JSON.stringify({ users }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
