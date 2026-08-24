import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');

  try {
    const db = getDb();

    if (campaignId) {
      const campaign = db.prepare(`
        SELECT c.*, t.subject as template_subject
        FROM campaigns c LEFT JOIN email_templates t ON c.template_id = t.id
        WHERE c.id = ?
      `).get(campaignId) as any;

      if (!campaign) return Response.json({ error: 'Not found' }, { status: 404 });

      const opens = (db.prepare('SELECT COUNT(DISTINCT tracking_id) as count FROM email_opens WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ?)').get(campaignId) as any).count;
      const clicks = (db.prepare('SELECT COUNT(*) as count FROM email_clicks WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ?)').get(campaignId) as any).count;
      const uniqueClicks = (db.prepare('SELECT COUNT(DISTINCT url) as count FROM email_clicks WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ?)').get(campaignId) as any).count;
      const topLinks = db.prepare('SELECT url, COUNT(*) as clicks FROM email_clicks WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ?) GROUP BY url ORDER BY clicks DESC LIMIT 10').all(campaignId);
      const hourlyOpens = db.prepare("SELECT strftime('%H', opened_at) as hour, COUNT(*) as count FROM email_opens WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ?) GROUP BY hour ORDER BY hour").all(campaignId);
      const bounces = (db.prepare('SELECT COUNT(*) as count FROM email_bounces WHERE campaign_id = ?').get(campaignId) as any).count;
      const sent = campaign.sent_count || 0;

      return Response.json({
        campaign: { ...campaign, opens, clicks, unique_clicks: uniqueClicks, open_rate: sent > 0 ? ((opens / sent) * 100).toFixed(1) : '0', click_rate: sent > 0 ? ((clicks / sent) * 100).toFixed(1) : '0', bounce_count: bounces },
        top_links: topLinks, hourly_opens: hourlyOpens,
      });
    }

    const totalSent = (db.prepare('SELECT COALESCE(SUM(sent_count), 0) as count FROM campaigns').get() as any).count;
    const totalOpens = (db.prepare('SELECT COUNT(*) as count FROM email_opens').get() as any).count;
    const totalClicks = (db.prepare('SELECT COUNT(*) as count FROM email_clicks').get() as any).count;
    const totalBounces = (db.prepare('SELECT COUNT(*) as count FROM email_bounces').get() as any).count;
    const totalUnsubs = (db.prepare('SELECT COUNT(*) as count FROM unsubscribes').get() as any).count;
    const recentCampaigns = db.prepare('SELECT id, name, status, sent_count, failed_count, open_count, CASE WHEN sent_count > 0 THEN ROUND(open_count * 100.0 / sent_count, 1) ELSE 0 END as open_rate, created_at FROM campaigns ORDER BY created_at DESC LIMIT 10').all();
    const topCampaigns = db.prepare('SELECT id, name, sent_count, open_count, CASE WHEN sent_count > 0 THEN ROUND(open_count * 100.0 / sent_count, 1) ELSE 0 END as open_rate FROM campaigns WHERE sent_count > 0 ORDER BY open_count DESC LIMIT 5').all();
    const bouncedEmails = db.prepare('SELECT DISTINCT email, bounce_type, error_message, bounced_at FROM email_bounces ORDER BY bounced_at DESC LIMIT 20').all();

    return Response.json({
      overview: {
        total_sent: totalSent, total_opens: totalOpens, total_clicks: totalClicks,
        total_bounces: totalBounces, total_unsubscribes: totalUnsubs,
        open_rate: totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '0',
        click_rate: totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : '0',
        bounce_rate: totalSent > 0 ? ((totalBounces / totalSent) * 100).toFixed(1) : '0',
      },
      recent_campaigns: recentCampaigns, top_campaigns: topCampaigns, bounced_emails: bouncedEmails,
    });
  } catch (err: any) {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
