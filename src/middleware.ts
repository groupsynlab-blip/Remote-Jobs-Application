import { NextRequest, NextResponse } from 'next/server';

// HMAC secret for signing session cookies — defaults to a built-in key for single-user app
const SECRET = process.env.AUTH_SECRET || 'bulk-emailer-session-secret-2024';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/health',
  '/api/auth',
  '/api/unsubscribe',
  '/api/landing-pages/public',
  '/landing-pages/public',
  '/api/track/click',
  '/api/track/bounce',
  '/api/track/open',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// HMAC-SHA256 sign (edge-runtime compatible)
async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Verify that a cookie value has a valid signature
async function verifySession(cookieValue: string, secret: string): Promise<boolean> {
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const payload = cookieValue.substring(0, dotIndex);
  const signature = cookieValue.substring(dotIndex + 1);

  // Check expiry (30 days)
  try {
    const data = JSON.parse(atob(payload));
    if (data.exp && Date.now() > data.exp) return false;
  } catch {
    return false;
  }

  const expectedSig = await sign(payload, secret);
  return signature === expectedSig;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const session = req.cookies.get('app_session')?.value;
  if (session && (await verifySession(session, SECRET))) {
    return NextResponse.next();
  }

  // Redirect to login, preserving the original URL
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Match all paths except static files and internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
