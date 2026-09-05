// Session issuance/verification shared by the proxy and auth routes.
// Uses WebCrypto (available in edge and Node runtimes).
// Epoch support: sessions embed the epoch at issue time; bumping the
// epoch setting in the DB instantly invalidates every prior session.
import { getDb } from './db';

const SECRET = process.env.AUTH_SECRET || 'bulk-emailer-session-secret-2024';
export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

async function sign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Current session epoch ( bumped to invalidate all sessions). */
export function getSessionEpoch(): number {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'session_epoch'").get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Invalidate every issued session by bumping the epoch. */
export function bumpSessionEpoch(): number {
  const db = getDb();
  const next = getSessionEpoch() + 1;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('session_epoch', ?)").run(String(next));
  return next;
}

export async function createSessionCookieValue(): Promise<string> {
  const payload = btoa(JSON.stringify({ auth: true, ts: Date.now(), exp: Date.now() + SESSION_DURATION, epoch: getSessionEpoch() }));
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionCookie(cookieValue: string): Promise<boolean> {
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const payload = cookieValue.substring(0, dotIndex);
  const signature = cookieValue.substring(dotIndex + 1);

  let parsed: { exp?: number; epoch?: number };
  try {
    parsed = JSON.parse(atob(payload));
  } catch {
    return false;
  }
  if (parsed.exp && Date.now() > parsed.exp) return false;

  // Epoch mismatch -> session was logged out everywhere
  if (typeof parsed.epoch === 'number' && parsed.epoch !== getSessionEpoch()) return false;

  const expectedSig = await sign(payload);
  return signature === expectedSig;
}

/** Build a login response with a fresh session cookie. */
export async function sessionResponse(body: Record<string, unknown>, status = 200): Promise<Response> {
  const cookieValue = await createSessionCookieValue();
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  res.headers.append(
    'Set-Cookie',
    `app_session=${cookieValue}; Path=/; Max-Age=${SESSION_DURATION / 1000}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );
  return res;
}
