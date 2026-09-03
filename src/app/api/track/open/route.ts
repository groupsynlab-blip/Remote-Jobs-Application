import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// 1x1 transparent GIF (43 bytes)
const PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

// GET /api/track/open?id=<tracking_id>
// Records an email open and returns a 1x1 transparent pixel
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingId = searchParams.get('id');

  if (trackingId) {
    try {
      const db = getDb();
      const userAgent = request.headers.get('user-agent') || null;
      const forwarded = request.headers.get('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0].trim() : null;

      // Verify this tracking ID belongs to a sent email
      const log = db.prepare(
        "SELECT id, campaign_id FROM email_logs WHERE tracking_id = ? AND status = 'sent'"
      ).get(trackingId) as { id: string; campaign_id: string } | undefined;

      if (log) {
        // Record the open event (allows multiple opens per email)
        db.prepare(
          'INSERT INTO email_opens (tracking_id, user_agent, ip_address) VALUES (?, ?, ?)'
        ).run(trackingId, userAgent, ip);

        // Update the campaign's open_count to unique opens
        db.prepare(
          "UPDATE campaigns SET open_count = (SELECT COUNT(DISTINCT tracking_id) FROM email_opens WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ? AND status = 'sent')) WHERE id = ?"
        ).run(log.campaign_id, log.campaign_id);
      }
    } catch (error: any) {
      // Log but don't break — always return the pixel
      console.error('[Tracking] Error recording open:', error?.message || error);
    }
  }

  // Always return the pixel, even if tracking failed
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
