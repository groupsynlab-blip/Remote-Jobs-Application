import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/smtp/health - SMTP deliverability stats per config
export async function GET() {
  try {
    const db = getDb();

    // Get all SMTP configs
    const configs = db.prepare('SELECT * FROM smtp_config ORDER BY created_at ASC').all() as any[];

    // Get per-config stats
    const statsRows = db.prepare(`
      SELECT
        smtp_config_id,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as total_sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as total_failed,
        MAX(sent_at) as last_sent_at
      FROM email_logs
      WHERE smtp_config_id IS NOT NULL
      GROUP BY smtp_config_id
    `).all() as any[];

    const statsMap: Record<string, any> = {};
    for (const row of statsRows) {
      statsMap[row.smtp_config_id] = row;
    }

    // Get per-config open counts
    const openRows = db.prepare(`
      SELECT el.smtp_config_id, COUNT(DISTINCT eo.tracking_id) as total_opened
      FROM email_opens eo
      INNER JOIN email_logs el ON eo.tracking_id = el.tracking_id
      WHERE el.smtp_config_id IS NOT NULL
      GROUP BY el.smtp_config_id
    `).all() as any[];

    const openMap: Record<string, number> = {};
    for (const row of openRows) {
      openMap[row.smtp_config_id] = row.total_opened;
    }

    // Get per-config error breakdown
    const errorRows = db.prepare(`
      SELECT smtp_config_id, error_message, COUNT(*) as count
      FROM email_logs
      WHERE status = 'failed' AND smtp_config_id IS NOT NULL AND error_message IS NOT NULL
      GROUP BY smtp_config_id, error_message
      ORDER BY count DESC
    `).all() as any[];

    // Get daily send volume (last 7 days)
    const dailyRows = db.prepare(`
      SELECT
        smtp_config_id,
        DATE(sent_at) as day,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM email_logs
      WHERE smtp_config_id IS NOT NULL AND sent_at IS NOT NULL
        AND sent_at >= datetime('now', '-7 days')
      GROUP BY smtp_config_id, DATE(sent_at)
      ORDER BY day ASC
    `).all() as any[];

    // Hourly usage
    const hourlyRows = db.prepare(`
      SELECT smtp_config_id, COUNT(*) as hourly_count
      FROM smtp_rate_tracking
      WHERE sent_at >= datetime('now', '-1 hour')
      GROUP BY smtp_config_id
    `).all() as any[];

    const hourlyMap: Record<string, number> = {};
    for (const row of hourlyRows) {
      hourlyMap[row.smtp_config_id] = row.hourly_count;
    }

    // Enrich configs
    const enriched = configs.map((c: any) => {
      const s = statsMap[c.id] || { total_sent: 0, total_failed: 0, last_sent_at: null };
      const totalSent = s.total_sent || 0;
      const totalFailed = s.total_failed || 0;
      const totalOpened = openMap[c.id] || 0;
      const total = totalSent + totalFailed;

      return {
        ...c,
        total_sent: totalSent,
        total_failed: totalFailed,
        total_opened: totalOpened,
        last_sent_at: s.last_sent_at,
        hourly_used: hourlyMap[c.id] || 0,
        errors: errorRows.filter((e: any) => e.smtp_config_id === c.id),
        daily_volume: dailyRows.filter((d: any) => d.smtp_config_id === c.id),
        delivery_rate: total > 0 ? ((totalSent / total) * 100).toFixed(1) : '0.0',
        open_rate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0',
      };
    });

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to get SMTP health', detail: error.message }, { status: 500 });
  }
}
