// src/pages/api/auth/approve.ts
import type { APIRoute } from 'astro';
import { AUTH_SECRET, SUPER_ADMIN_EMAILS } from 'astro:env/server';
import { verifySession, SESSION_COOKIE_NAME } from '../../../lib/auth';
import { getUser, saveUser, deleteUser, isSuperAdmin, type UserRecord } from '../../../lib/kv';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
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

  try {
    const body = await request.json();
    const { email, action, role } = body as {
      email: string;
      action: 'approve' | 'reject' | 'toggle_role' | 'delete';
      role?: 'ADMIN' | 'MEMBER';
    };

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing user email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targetEmail = email.toLowerCase().trim();

    // Prevent modifying permanent Super Admin accounts
    if (isSuperAdmin(targetEmail, superAdmins) && (action === 'delete' || action === 'reject')) {
      return new Response(JSON.stringify({ error: 'Cannot modify system super admin account' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      await deleteUser(locals, targetEmail);
      return new Response(JSON.stringify({ ok: true, deleted: targetEmail }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let userRecord = await getUser(locals, targetEmail, superAdmins);
    if (!userRecord) {
      userRecord = {
        email: targetEmail,
        name: targetEmail.split('@')[0],
        role: role || 'MEMBER',
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
      };
    }

    if (action === 'approve') {
      userRecord.status = 'APPROVED';
      if (role) userRecord.role = role;
      userRecord.approvedAt = new Date().toISOString();
      userRecord.approvedBy = session.email;
    } else if (action === 'reject') {
      userRecord.status = 'REJECTED';
    } else if (action === 'toggle_role') {
      userRecord.role = userRecord.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    }

    await saveUser(locals, userRecord);

    return new Response(JSON.stringify({ ok: true, user: userRecord }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Operation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
