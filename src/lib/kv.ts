// src/lib/kv.ts
// Cloudflare KV accessor with local development fallback (Astro v5+ compatible)

export interface UserRecord {
  email: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  picture?: string;
  requestedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

// In-memory store for local dev when KV binding is not present
const localMemoryStore = new Map<string, string>();

/**
 * Check if email belongs to Super Admin list
 */
export function isSuperAdmin(email: string, superAdminsStr?: string): boolean {
  if (!email) return false;
  const list = (superAdminsStr || 'ferdy.lazuardi@amartha.com,anggit.furqon@amartha.com')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase().trim());
}

/**
 * Resolve Cloudflare KV binding safely for Astro v5+ & Cloudflare Workers
 */
async function getKvBinding(locals?: any): Promise<any> {
  // 1. Try modern Astro v5+ / Cloudflare Workers binding
  try {
    const cf = await import('cloudflare:workers');
    if (cf?.env && (cf.env as any).AUTH_KV) {
      return (cf.env as any).AUTH_KV;
    }
  } catch {}

  // 2. Fallback check on process.env or global
  if (typeof process !== 'undefined' && (process.env as any)?.AUTH_KV) {
    return (process.env as any).AUTH_KV;
  }

  return null;
}

/**
 * Fetch a user record by email
 */
export async function getUser(
  locals: any,
  email: string,
  superAdminsStr?: string
): Promise<UserRecord | null> {
  const normalized = email.toLowerCase().trim();

  // Super Admins are always automatically APPROVED as ADMIN
  if (isSuperAdmin(normalized, superAdminsStr)) {
    return {
      email: normalized,
      name: normalized.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      role: 'ADMIN',
      status: 'APPROVED',
      requestedAt: '2026-01-01T00:00:00.000Z',
      approvedAt: '2026-01-01T00:00:00.000Z',
      approvedBy: 'SYSTEM_SUPER_ADMIN',
    };
  }

  const kv = await getKvBinding(locals);
  const key = `user:${normalized}`;

  if (kv) {
    try {
      const raw = await kv.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as UserRecord;
    } catch {
      return null;
    }
  } else {
    // Local dev fallback
    const raw = localMemoryStore.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserRecord;
    } catch {
      return null;
    }
  }
}

/**
 * Save or update user record
 */
export async function saveUser(locals: any, user: UserRecord): Promise<void> {
  const normalized = user.email.toLowerCase().trim();
  const kv = await getKvBinding(locals);
  const key = `user:${normalized}`;
  const serialized = JSON.stringify({
    ...user,
    email: normalized,
  });

  if (kv) {
    try {
      await kv.put(key, serialized);
    } catch (err) {
      console.warn('Failed to put to KV, falling back to local memory:', err);
      localMemoryStore.set(key, serialized);
    }
  } else {
    localMemoryStore.set(key, serialized);
  }
}

/**
 * List all users (including Super Admins and KV records)
 */
export async function listAllUsers(locals: any, superAdminsStr?: string): Promise<UserRecord[]> {
  const usersMap = new Map<string, UserRecord>();

  // 1. Seed Super Admins
  const superAdminList = (superAdminsStr || 'ferdy.lazuardi@amartha.com,anggit.furqon@amartha.com')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  for (const sa of superAdminList) {
    usersMap.set(sa, {
      email: sa,
      name: sa.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      role: 'ADMIN',
      status: 'APPROVED',
      requestedAt: '2026-01-01T00:00:00.000Z',
      approvedAt: '2026-01-01T00:00:00.000Z',
      approvedBy: 'SYSTEM_SUPER_ADMIN',
    });
  }

  // 2. Fetch from KV or local fallback
  const kv = await getKvBinding(locals);

  if (kv) {
    try {
      const listed = await kv.list({ prefix: 'user:' });
      for (const item of listed.keys) {
        const val = await kv.get(item.name);
        if (val) {
          try {
            const parsed = JSON.parse(val) as UserRecord;
            usersMap.set(parsed.email.toLowerCase(), parsed);
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Error listing from KV:', err);
    }
  } else {
    for (const [key, val] of localMemoryStore.entries()) {
      if (key.startsWith('user:')) {
        try {
          const parsed = JSON.parse(val) as UserRecord;
          usersMap.set(parsed.email.toLowerCase(), parsed);
        } catch {}
      }
    }
  }

  return Array.from(usersMap.values()).sort((a, b) => {
    // Sort PENDING first, then by date desc
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    return (b.requestedAt || '').localeCompare(a.requestedAt || '');
  });
}

/**
 * Delete a user from KV
 */
export async function deleteUser(locals: any, email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const kv = await getKvBinding(locals);
  const key = `user:${normalized}`;

  if (kv) {
    try {
      await kv.delete(key);
    } catch (err) {
      console.warn('Failed to delete from KV:', err);
      localMemoryStore.delete(key);
    }
  } else {
    localMemoryStore.delete(key);
  }
}
