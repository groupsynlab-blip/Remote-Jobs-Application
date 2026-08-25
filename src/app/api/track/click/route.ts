import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/track/click?id=xxx&url=yyy
 * Tracks link clicks and redirects to the original URL
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingId = searchParams.get('id');
  const url = searchParams.get('url');

  if (trackingId && url) {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO email_clicks (tracking_id, url, user_agent, ip_address)
         VALUES (?, ?, ?, ?)`
      ).run(
        trackingId,
        decodeURIComponent(url),
        request.headers.get('user-agent') || '',
        request.headers.get('x-forwarded-for') || ''
      );

      // Update campaign click count
      const log = db.prepare(
        `SELECT campaign_id FROM email_logs WHERE tracking_id = ?`
      ).get(trackingId) as { campaign_id: string } | undefined;

      if (log) {
        db.prepare(
          `UPDATE campaigns SET open_count = open_count WHERE id = ?`
        ).run(log.campaign_id);
      }
    } catch (err) {
      console.error('[Click Track] Error:', err);
    }
  }

  // Redirect to original URL (or fallback)
  const redirectUrl = url ? decodeURIComponent(url) : '/';
  return Response.redirect(redirectUrl, 302);
}
