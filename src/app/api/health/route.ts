import { NextResponse } from 'next/server';

/**
 * GET /api/health — unauthenticated liveness endpoint.
 * Lets Railway healthchecks and uptime monitors verify the app is
 * serving without needing a session. No sensitive data exposed.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'bulk-emailer',
    time: new Date().toISOString(),
  });
}
