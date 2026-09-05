// Password hashing + strength validation.
// Hashes use scrypt (memory-hard, salted) in a self-describing format:
//   scrypt$N$r$p$saltHex$hashHex
// Legacy unsalted SHA-256 hashes (hex, 64 chars) are still verified and
// transparently upgraded to scrypt on the next successful login.
import crypto from 'crypto';

const SCRYPT_N = 16384; // 2^14 — OWASP baseline
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

/** Hash a password with salted scrypt. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function sha256Hex(password: string): string {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface VerifyResult {
  ok: boolean;
  /** True when the stored hash was legacy SHA-256 and should be upgraded to scrypt. */
  needsUpgrade: boolean;
}

/** Verify a password against a stored hash (scrypt or legacy SHA-256). */
export function verifyPassword(password: string, stored: string): VerifyResult {
  if (stored.startsWith('scrypt$')) {
    try {
      const [, nStr, rStr, pStr, saltHex, hashHex] = stored.split('$');
      const expected = Buffer.from(hashHex, 'hex');
      const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
        N: parseInt(nStr, 10), r: parseInt(rStr, 10), p: parseInt(pStr, 10),
      });
      return { ok: crypto.timingSafeEqual(actual, expected), needsUpgrade: false };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  // Legacy unsalted SHA-256
  const ok = timingSafeEqualStr(sha256Hex(password), stored);
  return { ok, needsUpgrade: ok };
}

// ─── Strength rules ─────────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwerty123', 'abc123', 'letmein', 'welcome',
  'admin', 'admin123', 'iloveyou', 'monkey', 'dragon', 'football',
  'synlab', 'synlab2024', 'bulkemailer', 'emailer', ' gmail123',
]);

export interface StrengthResult {
  ok: boolean;
  message: string;
}

/** Server-side password strength policy for setting/updating passwords. */
export function validatePasswordStrength(password: string): StrengthResult {
  if (password.length < 10) {
    return { ok: false, message: 'Password must be at least 10 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must include a lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must include an uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must include a number' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: 'This password is too common — choose something unique' };
  }
  return { ok: true, message: 'Strong password' };
}

/** Client-friendly strength score 0-4 for a live meter. */
export function passwordScore(password: string): number {
  let score = 0;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (password.length >= 14 && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}
