import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/unsubscribe?email=<email>&campaign=<campaignId>
 * POST /api/unsubscribe { email, campaign }
 * Records the unsubscribe and shows a confirmation page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const campaignId = searchParams.get('campaign');

  if (email) {
    try {
      const db = getDb();
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      db.prepare(
        'INSERT OR IGNORE INTO unsubscribes (email, campaign_id, ip_address, user_agent) VALUES (?, ?, ?, ?)'
      ).run(email.toLowerCase(), campaignId, ip, userAgent);

      if (campaignId) {
        db.prepare(
          'UPDATE campaigns SET unsubscribe_count = unsubscribe_count + 1 WHERE id = ?'
        ).run(campaignId);
      }
    } catch (err) {
      console.error('[Unsubscribe] Error:', err);
    }
  }

  return new Response(`
    <!DOCTYPE html>
    <html>
    <head><title>Unsubscribed</title></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 3rem; color: #333;">
      <h1 style="color: #10b981;">You've been unsubscribed</h1>
      <p>You will no longer receive emails from this campaign.</p>
      <p style="color: #666; font-size: 0.85rem; margin-top: 2rem;">If this was a mistake, please contact the sender.</p>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email;

    if (!email || !email.includes('@')) {
      return Response.json({ success: false, error: 'Valid email required' }, { status: 400 });
    }

    const db = getDb();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    db.prepare(
      'INSERT OR IGNORE INTO unsubscribes (email, campaign_id, ip_address, user_agent) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase(), body.campaign || null, ip, userAgent);

    return Response.json({ success: true, message: 'You have been unsubscribed successfully.' });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message || 'Failed to unsubscribe' }, { status: 500 });
  }
}
