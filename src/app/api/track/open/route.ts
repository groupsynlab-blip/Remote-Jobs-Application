import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/track/open?id=<trackingId>
 * Returns a 1x1 transparent tracking pixel and records the open event.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingId = searchParams.get('id');

  console.log('[Track/Open] Pixel hit! trackingId:', trackingId);
  if (trackingId) {
    try {
      const db = getDb();
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      // Check if this tracking_id exists in email_logs
      const logEntry = db.prepare('SELECT id FROM email_logs WHERE tracking_id = ?').get(trackingId);
      console.log('[Track/Open] logEntry found:', !!logEntry);

      const existing = db.prepare(
        'SELECT id FROM email_opens WHERE tracking_id = ? AND user_agent = ? LIMIT 1'
      ).get(trackingId, userAgent);

      if (!existing) {
        db.prepare(
          'INSERT INTO email_opens (tracking_id, user_agent, ip_address) VALUES (?, ?, ?)'
        ).run(trackingId, userAgent, ip);
        console.log('[Track/Open] Open recorded for:', trackingId);
      } else {
        console.log('[Track/Open] Duplicate open, skipped for:', trackingId);
      }
    } catch (err: any) {
      console.error('[Track/Open] Error:', err.message || err);
    }
  } else {
    console.log('[Track/Open] No trackingId provided!');
  }

  // Return a 1x1 transparent GIF
  const pixel = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
    0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
    0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
    0x01, 0x00, 0x3b,
  ]);

  return new Response(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
