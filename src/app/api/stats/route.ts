import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/stats - Get overall statistics for dashboard
export async function GET() {
  try {
    const db = getDb();

    const totalContacts = (db.prepare('SELECT COUNT(*) as count FROM contacts').get() as any).count;
    const totalLists = (db.prepare('SELECT COUNT(*) as count FROM contact_lists').get() as any).count;
    const totalTemplates = (db.prepare('SELECT COUNT(*) as count FROM email_templates').get() as any).count;

    const campaignStats = db.prepare(`
      SELECT
        COUNT(*) as total_campaigns,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_campaigns,
        SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END) as active_campaigns,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled_campaigns,
        SUM(total_count) as total_emails,
        SUM(sent_count) as total_sent,
        SUM(failed_count) as total_failed,
        SUM(open_count) as total_opens
      FROM campaigns
    `).get() as Record<string, number> | undefined;

    const recentCampaigns = db.prepare(`
      SELECT c.*,
        t.name as template_name,
        cl.name as list_name
      FROM campaigns c
      LEFT JOIN email_templates t ON c.template_id = t.id
      LEFT JOIN contact_lists cl ON c.contact_list_id = cl.id
      ORDER BY c.created_at DESC
      LIMIT 5
    `).all();

    return NextResponse.json({
      totalContacts,
      totalLists,
      totalTemplates,
      ...campaignStats,
      recentCampaigns,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
