import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/track/bounce
 * Receives bounce notifications from SMTP servers
 * Body: { email, campaignId, bounceType, errorMessage }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, campaignId, bounceType, errorMessage } = await request.json();

    if (!email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }

    const db = getDb();
    const bounceTypeClean = bounceType === 'hard' ? 'hard' : 'soft';

    // Record bounce
    db.prepare(
      `INSERT INTO email_bounces (email, campaign_id, bounce_type, error_message)
       VALUES (?, ?, ?, ?)`
    ).run(email, campaignId || null, bounceTypeClean, errorMessage || '');

    // If hard bounce, mark the contact as bounced and update email log
    if (bounceTypeClean === 'hard') {
      // Update email log status
      db.prepare(
        `UPDATE email_logs SET status = 'bounced', error_message = ?
         WHERE contact_email = ? AND campaign_id = ?`
      ).run(errorMessage || 'Hard bounce', email, campaignId || '');

      // Update campaign counters
      if (campaignId) {
        db.prepare(
          `UPDATE campaigns SET failed_count = failed_count + 1, sent_count = MAX(0, sent_count - 1)
           WHERE id = ?`
        ).run(campaignId);
      }

      console.log(`[Bounce] Hard bounce recorded: ${email}`);
    }

    return Response.json({ success: true });

  } catch (err: any) {
    console.error('[Bounce] Error:', err.message);
    return Response.json({ error: 'Failed to record bounce' }, { status: 500 });
  }
}

/**
 * GET /api/track/bounce — get bounced emails list
 */
export async function GET() {
  try {
    const db = getDb();
    const bounces = db.prepare(
      `SELECT DISTINCT email, bounce_type, error_message, bounced_at
       FROM email_bounces ORDER BY bounced_at DESC LIMIT 500`
    ).all();

    return Response.json({ bounces });

  } catch (err: any) {
    return Response.json({ error: 'Failed to get bounces' }, { status: 500 });
  }
}
