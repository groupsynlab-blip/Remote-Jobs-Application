import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/session';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/landing-pages/public',
  '/landing-pages/public',
  '/api/track/click',
  '/api/track/bounce',
  '/api/track/open',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Session verification (signature + expiry + epoch) lives in lib/session

export async function proxy(req: NextRequest) {
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
  if (session && (await verifySessionCookie(session))) {
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
