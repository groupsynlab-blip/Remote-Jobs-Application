import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/campaigns - Get all campaigns
export async function GET() {
  try {
    const db = getDb();
    const campaigns = db.prepare(`
      SELECT c.*, 
        t.name as template_name, 
        cl.name as list_name,
        (SELECT COUNT(*) FROM email_logs WHERE campaign_id = c.id AND status = 'sent') as log_sent,
        (SELECT COUNT(*) FROM email_logs WHERE campaign_id = c.id AND status = 'failed') as log_failed,
        (SELECT COUNT(*) FROM email_logs WHERE campaign_id = c.id AND status = 'skipped') as log_skipped,
        (SELECT COUNT(*) FROM email_logs WHERE campaign_id = c.id AND status = 'queued') as log_queued
      FROM campaigns c
      LEFT JOIN email_templates t ON c.template_id = t.id
      LEFT JOIN contact_lists cl ON c.contact_list_id = cl.id
      ORDER BY c.created_at DESC
    `).all();

    // Per-SMTP sent breakdown for active campaigns (live counter display)
    const campaignsArr = campaigns as any[];
    if (campaignsArr.some((c) => c.status === 'sending' || c.status === 'paused')) {
      const rows = db.prepare(`
        SELECT campaign_id, smtp_config_id, COUNT(*) as cnt
        FROM email_logs
        WHERE status = 'sent' AND smtp_config_id IS NOT NULL
          AND campaign_id IN (SELECT id FROM campaigns WHERE status IN ('sending', 'paused'))
        GROUP BY campaign_id, smtp_config_id
      `).all() as { campaign_id: string; smtp_config_id: string; cnt: number }[];
      const byCampaign: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        if (!byCampaign[r.campaign_id]) byCampaign[r.campaign_id] = {};
        byCampaign[r.campaign_id][r.smtp_config_id] = r.cnt;
      }
      for (const c of campaignsArr) {
        if (c.status === 'sending' || c.status === 'paused') {
          c.smtp_sent_counts = byCampaign[c.id] || {};
        }
      }
    }

    return NextResponse.json(campaigns);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get campaigns' }, { status: 500 });
  }
}

// POST /api/campaigns - Create a campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    const id = uuidv4();

    // Get contact count for the list
    let totalCount = 0;
    if (body.contact_list_id) {
      const countResult = db.prepare(
        'SELECT COUNT(*) as count FROM contact_list_members WHERE contact_list_id = ?'
      ).get(body.contact_list_id) as { count: number };
      totalCount = countResult.count;
    }

    // Use provided total_count if no list
    if (!totalCount && body.total_count) {
      totalCount = body.total_count;
    }

    // Store subject rotation as JSON array
    let subjectRotation = null;
    if (body.subject_rotation && Array.isArray(body.subject_rotation) && body.subject_rotation.length > 0) {
      subjectRotation = JSON.stringify(body.subject_rotation);
    }

    // Store template rotation as JSON array of template IDs
    let templateRotation = null;
    if (body.template_rotation && Array.isArray(body.template_rotation) && body.template_rotation.length > 0) {
      templateRotation = JSON.stringify(body.template_rotation);
    }

    // Store selected SMTP IDs as JSON array
    let selectedSmtpIds = null;
    if (body.selected_smtp_ids && Array.isArray(body.selected_smtp_ids) && body.selected_smtp_ids.length > 0) {
      selectedSmtpIds = JSON.stringify(body.selected_smtp_ids);
    }

    db.prepare(`
      INSERT INTO campaigns (id, name, template_id, contact_list_id, status, scheduled_at, delay_seconds, reply_to, subject_rotation, template_rotation, selected_smtp_ids, enable_tracking, enable_unsubscribe, total_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      body.template_id,
      body.contact_list_id,
      body.scheduled_at ? 'scheduled' : 'draft',
      body.scheduled_at || null,
      body.delay_seconds || 2,
      body.reply_to || null,
      subjectRotation,
      templateRotation,
      selectedSmtpIds,
      body.enable_tracking !== undefined ? (body.enable_tracking ? 1 : 0) : 1,
      body.enable_unsubscribe !== undefined ? (body.enable_unsubscribe ? 1 : 0) : 1,
      totalCount
    );

    return NextResponse.json({ success: true, id, total_count: totalCount });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
