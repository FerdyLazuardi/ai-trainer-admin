// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { AUTH_SECRET } from 'astro:env/server';
import { verifySession, SESSION_COOKIE_NAME } from './lib/auth';

const PUBLIC_ROUTES = [
  '/login',
  '/pending-access',
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/auth/request-access',
];

const INGESTION_API_PREFIXES = [
  '/api/sync',
  '/api/parse',
  '/api/courses/sync',
  '/api/courses/schedule',
  '/api/schedule',
  '/api/moodle-sync',
];

export const onRequest = defineMiddleware(async ({ url, cookies, redirect, locals }, next) => {
  const pathname = url.pathname;

  // 1. Allow static assets and public routes
  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    PUBLIC_ROUTES.includes(pathname)
  ) {
    // If authenticated & approved user tries to visit /login or /pending-access, redirect to /
    if (pathname === '/login' || pathname === '/pending-access') {
      const authSecret = AUTH_SECRET || (process.env.AUTH_SECRET ?? 'amartha_cag_secret_session_token_key_2026');
      const cookieVal = cookies.get(SESSION_COOKIE_NAME)?.value;
      const session = await verifySession(cookieVal, authSecret);
      if (session && session.status === 'APPROVED') {
        return redirect('/');
      }
    }
    return next();
  }

  // 2. Verify Session
  const authSecret = AUTH_SECRET || (process.env.AUTH_SECRET ?? 'amartha_cag_secret_session_token_key_2026');
  const cookieVal = cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(cookieVal, authSecret);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/login');
  }

  // 3. User is authenticated, check status
  if (session.status !== 'APPROVED') {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Forbidden: Account approval pending' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/pending-access');
  }

  // 4. Role-based check for Ingestion API routes (Only ADMIN allowed)
  if (session.role !== 'ADMIN') {
    const isIngestionApi = INGESTION_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (isIngestionApi) {
      return new Response(JSON.stringify({ error: 'Forbidden: Ingestion operations restricted to administrators' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 5. Attach user to locals
  (locals as any).user = session;

  return next();
});
