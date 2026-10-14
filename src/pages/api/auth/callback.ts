// src/pages/api/auth/callback.ts
import type { APIRoute } from 'astro';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, SUPER_ADMIN_EMAILS } from 'astro:env/server';
import { signSession, SESSION_COOKIE_NAME } from '../../../lib/auth';
import { getUser, saveUser, isSuperAdmin } from '../../../lib/kv';

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return redirect(`/login?error=${encodeURIComponent(error || 'cancelled')}`);
  }

  const clientId = GOOGLE_CLIENT_ID || (process.env.GOOGLE_CLIENT_ID ?? '');
  const clientSecret = GOOGLE_CLIENT_SECRET || (process.env.GOOGLE_CLIENT_SECRET ?? '');
  const authSecret = AUTH_SECRET || (process.env.AUTH_SECRET ?? 'amartha_cag_secret_session_token_key_2026');
  const superAdmins = SUPER_ADMIN_EMAILS || (process.env.SUPER_ADMIN_EMAILS ?? 'ferdy.lazuardi@amartha.com,anggit.furqon@amartha.com');

  if (!clientId || !clientSecret) {
    return redirect('/login?error=missing_credentials');
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Failed to exchange Google token:', errText);
      return redirect('/login?error=token_exchange_failed');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch authenticated user profile
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return redirect('/login?error=userinfo_failed');
    }

    const googleUser = await userRes.json();
    const email = (googleUser.email || '').toLowerCase().trim();
    const name = googleUser.name || email.split('@')[0];
    const picture = googleUser.picture || '';

    // 3. STRICT DOMAIN VALIDATION: Only @amartha.com accounts permitted
    if (!email.endsWith('@amartha.com')) {
      return redirect('/login?error=invalid_domain');
    }

    // 4. Resolve Whitelist & Role
    let role: 'ADMIN' | 'MEMBER' = 'MEMBER';
    let status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';

    if (isSuperAdmin(email, superAdmins)) {
      role = 'ADMIN';
      status = 'APPROVED';
      // Auto-persist super admin to KV record for consistency
      await saveUser(locals, {
        email,
        name,
        picture,
        role: 'ADMIN',
        status: 'APPROVED',
        requestedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        approvedBy: 'SYSTEM_SUPER_ADMIN',
      });
    } else {
      const record = await getUser(locals, email, superAdmins);
      if (record) {
        role = record.role || 'MEMBER';
        status = record.status || 'PENDING';
        // Refresh picture & name if changed
        if (record.picture !== picture || record.name !== name) {
          await saveUser(locals, {
            ...record,
            name,
            picture,
          });
        }
      } else {
        // First-time login: Record in KV as PENDING
        status = 'PENDING';
        role = 'MEMBER';
        await saveUser(locals, {
          email,
          name,
          picture,
          role: 'MEMBER',
          status: 'PENDING',
          requestedAt: new Date().toISOString(),
        });
      }
    }

    // 5. Sign Session Cookie
    const sessionToken = await signSession(
      {
        email,
        name,
        picture,
        role,
        status,
      },
      authSecret
    );

    cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600, // 7 days
    });

    // 6. Route to dashboard if approved, otherwise to pending approval page
    if (status === 'APPROVED') {
      return redirect('/');
    } else {
      return redirect('/pending-access');
    }
  } catch (err: any) {
    console.error('Auth callback error:', err);
    return redirect(`/login?error=${encodeURIComponent(err.message || 'unknown')}`);
  }
};
