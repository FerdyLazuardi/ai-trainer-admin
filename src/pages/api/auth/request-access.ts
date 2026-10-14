// src/pages/api/auth/request-access.ts
import type { APIRoute } from 'astro';
import { AUTH_SECRET, SUPER_ADMIN_EMAILS } from 'astro:env/server';
import { verifySession, signSession, SESSION_COOKIE_NAME } from '../../../lib/auth';
import { getUser, saveUser } from '../../../lib/kv';

export const POST: APIRoute = async ({ cookies, locals, request }) => {
  const authSecret = AUTH_SECRET || (process.env.AUTH_SECRET ?? 'amartha_cag_secret_session_token_key_2026');
  const superAdmins = SUPER_ADMIN_EMAILS || (process.env.SUPER_ADMIN_EMAILS ?? 'ferdy.lazuardi@amartha.com,anggit.furqon@amartha.com');

  const cookieVal = cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(cookieVal, authSecret);

  if (!session || !session.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Session missing or invalid' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = session.email.toLowerCase().trim();

  // Check current status in KV (admin might have approved already)
  let userRecord = await getUser(locals, email, superAdmins);

  if (!userRecord) {
    userRecord = {
      email,
      name: session.name || email.split('@')[0],
      picture: session.picture || '',
      role: 'MEMBER',
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    await saveUser(locals, userRecord);
  } else if (userRecord.status === 'APPROVED') {
    // Re-sign session cookie with approved status
    const newSessionToken = await signSession(
      {
        email,
        name: userRecord.name,
        picture: userRecord.picture,
        role: userRecord.role,
        status: 'APPROVED',
      },
      authSecret
    );

    cookies.set(SESSION_COOKIE_NAME, newSessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600,
    });

    return new Response(JSON.stringify({ ok: true, status: 'APPROVED' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, status: userRecord.status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
