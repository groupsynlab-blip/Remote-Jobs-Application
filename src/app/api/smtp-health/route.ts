import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/smtp-health - Get SMTP health data with per-SMTP send history
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const smtpId = searchParams.get('smtp_id');
    const days = parseInt(searchParams.get('days') || '7');

    // Get all SMTP configs with rate usage
    const configs = db.prepare('SELECT * FROM smtp_config ORDER BY created_at ASC').all() as any[];

    // Calculate hourly and daily usage for each SMTP
    const configsWithHealth = configs.map((c) => {
      const hourlyUsed = db.prepare(
        `SELECT COUNT(*) as count FROM smtp_rate_tracking WHERE smtp_config_id = ? AND sent_at > datetime('now', '-1 hour')`
      ).get(c.id) as { count: number };

      const dailyUsed = db.prepare(
        `SELECT COUNT(*) as count FROM smtp_rate_tracking WHERE smtp_config_id = ? AND sent_at > datetime('now', 'start of day')`
      ).get(c.id) as { count: number };

      // Total emails sent (all time)
      const totalSent = db.prepare(
        `SELECT COUNT(*) as count FROM email_logs WHERE smtp_config_id = ? AND status = 'sent'`
      ).get(c.id) as { count: number };

      // Failed emails
      const totalFailed = db.prepare(
        `SELECT COUNT(*) as count FROM email_logs WHERE smtp_config_id = ? AND status = 'failed'`
      ).get(c.id) as { count: number };

      // Last used
      const lastUsed = db.prepare(
        `SELECT sent_at FROM smtp_rate_tracking WHERE smtp_config_id = ? ORDER BY sent_at DESC LIMIT 1`
      ).get(c.id) as { sent_at: string } | undefined;

      return {
        ...c,
        rate_usage: {
          hourly_used: hourlyUsed.count,
          daily_used: dailyUsed.count,
        },
        stats: {
          total_sent: totalSent.count,
          total_failed: totalFailed.count,
          success_rate: totalSent.count + totalFailed.count > 0
            ? ((totalSent.count / (totalSent.count + totalFailed.count)) * 100).toFixed(1)
            : '0.0',
        },
        last_used: lastUsed?.sent_at || null,
      };
    });

    // If specific SMTP selected, get its recent send logs
    let sendLogs: any[] = [];
    let dailyBreakdown: any[] = [];
    if (smtpId) {
      sendLogs = db.prepare(`
        SELECT el.contact_email, el.contact_name, el.status, el.subject_used, 
               el.sent_at, el.error_message, c.name as campaign_name
        FROM email_logs el
        LEFT JOIN campaigns c ON el.campaign_id = c.id
        WHERE el.smtp_config_id = ?
        ORDER BY el.sent_at DESC
        LIMIT 200
      `).all(smtpId) as any[];

      // Get daily breakdown for this SMTP (last N days)
      dailyBreakdown = db.prepare(`
        SELECT date(sent_at) as day, COUNT(*) as count, status
        FROM email_logs
        WHERE smtp_config_id = ? AND sent_at > datetime('now', '-' || ? || ' days')
        GROUP BY date(sent_at), status
        ORDER BY day DESC
      `).all(smtpId, days) as any[];

      return NextResponse.json({
        configs: configsWithHealth,
        selected_smtp: smtpId,
        send_logs: sendLogs,
        daily_breakdown: dailyBreakdown,
      });
    }

    // Get overall daily breakdown for all SMTPs
    dailyBreakdown = db.prepare(`
      SELECT date(sent_at) as day, smtp_config_id, COUNT(*) as count, status
      FROM email_logs
      WHERE sent_at > datetime('now', '-' || ? || ' days')
      GROUP BY date(sent_at), smtp_config_id, status
      ORDER BY day DESC
    `).all(days) as any[];

    return NextResponse.json({
      configs: configsWithHealth,
      send_logs: [],
      daily_breakdown: dailyBreakdown,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to get SMTP health data' }, { status: 500 });
  }
}
