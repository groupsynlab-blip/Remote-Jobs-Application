// DB-backed login rate limiting — survives restarts, works across the single
// Railway instance. Per-IP failure counting with escalating lockouts.
import { getDb } from './db';

const MAX_FAILURES = 5;                     // failures allowed per window
const FAILURE_WINDOW_MS = 15 * 60 * 1000;   // 15 min failure-counting window
const BASE_LOCKOUT_MS = 15 * 60 * 1000;     // first lockout: 15 min
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000; // lockout cap: 24 h

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_rate_limit (
      ip TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      window_start TEXT NOT NULL,
      locked_until TEXT
    )
  `);
  schemaReady = true;
}

/** Best-effort client IP extraction (x-forwarded-for first, as set by Railway's proxy). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function nowMs() { return Date.now(); }

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

/** Check whether this IP may attempt a sensitive auth action. */
export function checkRateLimit(ip: string): RateLimitResult {
  ensureSchema();
  const db = getDb();
  const row = db.prepare('SELECT * FROM login_rate_limit WHERE ip = ?').get(ip) as
    | { ip: string; failures: number; window_start: string; locked_until: string | null }
    | undefined;

  const now = nowMs();

  if (!row) return { allowed: true, retryAfterSec: 0, remaining: MAX_FAILURES };

  // Under active lockout?
  if (row.locked_until) {
    const until = new Date(row.locked_until).getTime();
    if (until > now) {
      return { allowed: false, retryAfterSec: Math.ceil((until - now) / 1000), remaining: 0 };
    }
    // Lockout expired — clear it, keep failure history at max so the next failure re-locks
    db.prepare('UPDATE login_rate_limit SET locked_until = NULL WHERE ip = ?').run(ip);
  }

  // Expire the failure-counting window
  const windowStart = new Date(row.window_start).getTime();
  if (now - windowStart > FAILURE_WINDOW_MS) {
    db.prepare('UPDATE login_rate_limit SET failures = 0, window_start = ? WHERE ip = ?')
      .run(new Date(now).toISOString(), ip);
    return { allowed: true, retryAfterSec: 0, remaining: MAX_FAILURES };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, MAX_FAILURES - row.failures),
  };
}

/** Record a failed attempt and lock out the IP if the threshold is crossed. */
export function recordFailure(ip: string): void {
  ensureSchema();
  const db = getDb();
  const now = new Date(nowMs());
  const row = db.prepare('SELECT * FROM login_rate_limit WHERE ip = ?').get(ip) as
    | { ip: string; failures: number; window_start: string; locked_until: string | null }
    | undefined;

  if (!row) {
    db.prepare(
      'INSERT INTO login_rate_limit (ip, failures, window_start) VALUES (?, 1, ?)'
    ).run(ip, now.toISOString());
    return;
  }

  const windowStart = new Date(row.window_start).getTime();
  let failures = row.failures;
  if (nowMs() - windowStart > FAILURE_WINDOW_MS) {
    failures = 0; // window expired — restart counting
  }
  failures += 1;

  if (failures >= MAX_FAILURES) {
    // Escalating lockout: doubles with each consecutive lockup, capped at 24h
    const priorLock = row.locked_until ? new Date(row.locked_until).getTime() : 0;
    const lockMs = Math.min(
      Math.max(BASE_LOCKOUT_MS * Math.pow(2, Math.floor(failures / MAX_FAILURES) - 1), BASE_LOCKOUT_MS),
      MAX_LOCKOUT_MS
    );
    const until = new Date(nowMs() + lockMs).toISOString();
    db.prepare(
      'UPDATE login_rate_limit SET failures = ?, window_start = ?, locked_until = ? WHERE ip = ?'
    ).run(failures, now.toISOString(), until, ip);
  } else {
    db.prepare(
      'UPDATE login_rate_limit SET failures = ?, window_start = ? WHERE ip = ?'
    ).run(failures, now.toISOString(), ip);
  }
}

/** Clear failures for an IP after a successful auth. */
export function clearFailures(ip: string): void {
  ensureSchema();
  const db = getDb();
  db.prepare('DELETE FROM login_rate_limit WHERE ip = ?').run(ip);
}

/** Wrap a handler with rate limiting: check first, record failure on 401. */
export function rateLimitResponse(ip: string): Response {
  const { retryAfterSec } = checkRateLimit(ip);
  return new Response(
    JSON.stringify({
      error: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    }
  );
}
