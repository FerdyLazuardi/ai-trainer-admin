// src/lib/auth.ts
// Native Web Crypto session management (zero third-party dependencies)

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  exp: number; // Expiry epoch timestamp in seconds
}

export const SESSION_COOKIE_NAME = 'cag_session';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Sign user payload into a tamper-proof session token: `${base64payload}.${signature}`
 */
export async function signSession(
  user: Omit<SessionUser, 'exp'>,
  secret: string,
  maxAgeSec: number = 7 * 24 * 3600 // 7 days
): Promise<string> {
  const payload: SessionUser = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const key = await getHmacKey(secret);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  const sigStr = String.fromCharCode(...sigArray);
  const sigB64 = base64UrlEncode(sigStr);

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify and decode session token. Returns null if invalid or expired.
 */
export async function verifySession(token: string | undefined, secret: string): Promise<SessionUser | null> {
  if (!token || !token.includes('.')) return null;

  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await getHmacKey(secret);
    const rawSig = base64UrlDecode(sigB64);
    const sigArray = new Uint8Array(rawSig.length);
    for (let i = 0; i < rawSig.length; i++) {
      sigArray[i] = rawSig.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify('HMAC', key, sigArray, encoder.encode(payloadB64));
    if (!isValid) return null;

    const payloadJson = base64UrlDecode(payloadB64);
    const session: SessionUser = JSON.parse(payloadJson);

    // Validate expiration
    if (session.exp && session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  } catch (err) {
    return null;
  }
}
