import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/campaigns/[id]/details — Returns per-email logs with SMTP assignment
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const campaign = db.prepare(`
    SELECT c.*, t.subject as template_subject, t.body as template_body
    FROM campaigns c LEFT JOIN email_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(id) as any;

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get per-email logs with SMTP info
  const logs = db.prepare(`
    SELECT 
      el.id,
      el.contact_name,
      el.contact_email,
      el.status,
      el.error_message,
      el.sent_at,
      el.created_at,
      el.subject_used,
      el.smtp_config_id,
      COALESCE(sc.name, sc.from_email, 'Unknown') as smtp_name,
      sc.host as smtp_host,
      sc.from_email as smtp_from
    FROM email_logs el
    LEFT JOIN smtp_config sc ON el.smtp_config_id = sc.id
    WHERE el.campaign_id = ?
    ORDER BY el.created_at ASC
  `).all(id);

  // Get summary stats per SMTP
  const smtpStats = db.prepare(`
    SELECT 
      COALESCE(sc.name, sc.from_email, 'Unknown') as smtp_name,
      el.smtp_config_id,
      COUNT(*) as total,
      SUM(CASE WHEN el.status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN el.status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN el.status = 'queued' THEN 1 ELSE 0 END) as queued
    FROM email_logs el
    LEFT JOIN smtp_config sc ON el.smtp_config_id = sc.id
    WHERE el.campaign_id = ?
    GROUP BY el.smtp_config_id
    ORDER BY sent DESC
  `).all(id);

  // Get status breakdown
  const statusBreakdown = db.prepare(`
    SELECT 
      status,
      COUNT(*) as count
    FROM email_logs
    WHERE campaign_id = ?
    GROUP BY status
  `).all(id);

  return Response.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      total_count: campaign.total_count,
      sent_count: campaign.sent_count,
      failed_count: campaign.failed_count,
      created_at: campaign.created_at,
      tags: campaign.tags,
    },
    logs,
    smtp_stats: smtpStats,
    status_breakdown: statusBreakdown,
  });
}
