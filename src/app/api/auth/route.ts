import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getClientIp, checkRateLimit, recordFailure, clearFailures, rateLimitResponse } from '@/lib/rate-limit';
import { hashPassword, verifyPassword, validatePasswordStrength } from '@/lib/password';
import { createSessionCookieValue, bumpSessionEpoch, verifySessionCookie } from '@/lib/session';

function generateRecoveryCode(): string {
  const words = ['ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL','INDIA','JULIET','KILO','LIMA','MIKE','NOVEMBER','OSCAR','PAPA','QUEBEC','ROMEO','SIERRA','TANGO','UNIFORM','VICTOR','WHISKY','XRAY','YANKEE','ZULU'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const d1 = String(Math.floor(1000 + Math.random() * 9000));
  const d2 = String(Math.floor(1000 + Math.random() * 9000));
  return `${w1}-${d1}-${w2}-${d2}`;
}

async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function setSessionOnResponse(response: NextResponse, cookieValue: string) {
  response.cookies.set('app_session', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

/** GET /api/auth — whether a password has been set (for login page UI) */
export async function GET() {
  const db = getDb();
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'app_password'").get() as { value: string } | undefined;
  return NextResponse.json({ passwordSet: !!stored });
}

/** POST /api/auth — login with password (sets it on first use) */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip).allowed) {
    return rateLimitResponse(ip);
  }

  const body = await req.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  const db = getDb();
  let stored = db.prepare("SELECT value FROM settings WHERE key = 'app_password'").get() as { value: string } | undefined;
  let isFirstTime = false;

  if (!stored) {
    // First use — require a strong password before accepting it
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.message, firstUse: true }, { status: 400 });
    }
    const hash = hashPassword(password);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password', ?)").run(hash);
    const recoveryCode = generateRecoveryCode();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('recovery_code', ?)").run(recoveryCode);

    stored = { value: hash };
    isFirstTime = true;
  }

  // Verify password (scrypt or legacy SHA-256)
  const { ok, needsUpgrade } = verifyPassword(password, stored.value);
  if (!ok) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Transparent upgrade: legacy SHA-256 hash -> salted scrypt
  if (needsUpgrade) {
    try {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'app_password'").run(hashPassword(password));
    } catch {}
  }

  clearFailures(ip);

  const cookieValue = await createSessionCookieValue();
  const response = NextResponse.json({
    success: true,
    ...(isFirstTime ? { recoveryCode: (db.prepare("SELECT value FROM settings WHERE key = 'recovery_code'").get() as { value: string })?.value } : {}),
  });
  setSessionOnResponse(response, cookieValue);
  return response;
}

/** DELETE /api/auth — logout (current device only) */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('app_session', '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 0,
  });
  return response;
}

/** PATCH /api/auth — logout everywhere: invalidate ALL sessions via epoch bump.
 *  Requires a valid current session (this endpoint is behind the auth proxy). */
export async function PATCH(req: NextRequest) {
  const session = req.cookies.get('app_session')?.value;
  if (!session || !(await verifySessionCookie(session))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const epoch = bumpSessionEpoch();
  // Issue a fresh session for the current device so it stays logged in
  const cookieValue = await createSessionCookieValue();
  const response = NextResponse.json({ success: true, message: 'All other sessions have been logged out', epoch });
  setSessionOnResponse(response, cookieValue);
  return response;
}

/** PUT /api/auth — change password (requires current password) */
export async function PUT(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip).allowed) {
    return rateLimitResponse(ip);
  }

  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both current and new password required' }, { status: 400 });
  }

  const db = getDb();
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'app_password'").get() as { value: string } | undefined;
  if (!stored) return NextResponse.json({ error: 'No password set' }, { status: 400 });

  const currentCheck = verifyPassword(currentPassword, stored.value);
  if (!currentCheck.ok) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  clearFailures(ip);

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.message }, { status: 400 });
  }

  const newHash = hashPassword(newPassword);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'app_password'").run(newHash);

  // Regenerate recovery code
  const newRecoveryCode = generateRecoveryCode();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('recovery_code', ?)").run(newRecoveryCode);

  const cookieValue = await createSessionCookieValue();
  const response = NextResponse.json({ success: true, message: 'Password updated', recoveryCode: newRecoveryCode });
  setSessionOnResponse(response, cookieValue);
  return response;
}
