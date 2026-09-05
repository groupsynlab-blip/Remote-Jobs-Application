import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getClientIp, checkRateLimit, recordFailure, clearFailures, rateLimitResponse } from '@/lib/rate-limit';

const SECRET = process.env.AUTH_SECRET || 'bulk-emailer-session-secret-2024';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

/** POST /api/auth/recover — reset password with recovery code */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip).allowed) {
    return rateLimitResponse(ip);
  }

  const { recoveryCode, newPassword } = await req.json();

  if (!recoveryCode || !newPassword) {
    return NextResponse.json({ error: 'Recovery code and new password required' }, { status: 400 });
  }
  if (newPassword.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  const db = getDb();
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'recovery_code'").get() as { value: string } | undefined;

  if (!stored) {
    return NextResponse.json({ error: 'No recovery code set. Please reinstall the app.' }, { status: 400 });
  }

  // Compare recovery code (case-insensitive, trimmed)
  if (recoveryCode.trim().toUpperCase() !== stored.value.trim().toUpperCase()) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Invalid recovery code' }, { status: 401 });
  }

  clearFailures(ip);

  // Set new password
  const newHash = await hashPassword(newPassword);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'app_password'").run(newHash);

  // Generate new recovery code
  const words = ['ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL','INDIA','JULIET','KILO','LIMA','MIKE','NOVEMBER','OSCAR','PAPA','QUEBEC','ROMEO','SIERRA','TANGO','UNIFORM','VICTOR','WHISKY','XRAY','YANKEE','ZULU'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const d1 = String(Math.floor(1000 + Math.random() * 9000));
  const d2 = String(Math.floor(1000 + Math.random() * 9000));
  const newRecoveryCode = `${w1}-${d1}-${w2}-${d2}`;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'recovery_code'").run(newRecoveryCode);

  // Auto-login after recovery
  const payload = btoa(JSON.stringify({ auth: true, ts: Date.now(), exp: Date.now() + SESSION_DURATION }));
  const cookieValue = `${payload}.${await sign(payload, SECRET)}`;

  const response = NextResponse.json({
    success: true,
    message: 'Password reset successful',
    newRecoveryCode,
  });
  response.cookies.set('app_session', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: SESSION_DURATION / 1000,
  });

  return response;
}
