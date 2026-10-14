// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { GOOGLE_CLIENT_ID } from 'astro:env/server';

export const GET: APIRoute = async ({ url, redirect }) => {
  const clientId = GOOGLE_CLIENT_ID || (process.env.GOOGLE_CLIENT_ID ?? '');

  if (!clientId) {
    return redirect('/login?error=missing_credentials');
  }

  const redirectUri = `${url.origin}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    hd: 'amartha.com',
    prompt: 'select_account',
    access_type: 'online',
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};
