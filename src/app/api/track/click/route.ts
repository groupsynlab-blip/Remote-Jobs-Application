import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/track/click?id=<trackingId>&url=<encodedUrl>
 * Records the click event and redirects to the original URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingId = searchParams.get('id');
  const url = searchParams.get('url');

  if (trackingId) {
    try {
      const db = getDb();
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      db.prepare(
        'INSERT INTO email_clicks (tracking_id, url, user_agent, ip_address) VALUES (?, ?, ?, ?)'
      ).run(trackingId, url || '', userAgent, ip);
    } catch (err) {
      console.error('[Track/Click] Error:', err);
    }
  }

  // Redirect to the original URL
  if (url) {
    return Response.redirect(url, 302);
  }

  return new Response('OK', { status: 200 });
}
