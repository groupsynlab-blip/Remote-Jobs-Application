import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/campaigns/[id] - Get campaign details with stats including opens
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const campaign = db.prepare(`
      SELECT c.*,
        t.name as template_name, t.subject as template_subject, t.body as template_body,
        cl.name as list_name
      FROM campaigns c
      LEFT JOIN email_templates t ON c.template_id = t.id
      LEFT JOIN contact_lists cl ON c.contact_list_id = cl.id
      WHERE c.id = ?
    `).get(id);

    // Get logs with open counts and subject_used
    const logs = db.prepare(`
      SELECT
        el.*,
        COALESCE(open_data.open_count, 0) as open_count,
        open_data.first_opened_at
      FROM email_logs el
      LEFT JOIN (
        SELECT tracking_id,
          COUNT(*) as open_count,
          MIN(opened_at) as first_opened_at
        FROM email_opens
        GROUP BY tracking_id
      ) open_data ON el.tracking_id = open_data.tracking_id
      WHERE el.campaign_id = ?
      ORDER BY el.created_at DESC
    `).all(id);

    // Stats including unique opens
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN el.status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN el.status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN el.status = 'queued' THEN 1 ELSE 0 END) as queued,
        COALESCE(open_stats.unique_opens, 0) as opened
      FROM email_logs el
      LEFT JOIN (
        SELECT COUNT(DISTINCT tracking_id) as unique_opens
        FROM email_opens
        WHERE tracking_id IN (
          SELECT tracking_id FROM email_logs WHERE campaign_id = ? AND status = 'sent'
        )
      ) open_stats ON 1=1
      WHERE el.campaign_id = ?
    `).get(id, id);

    return NextResponse.json({ campaign, logs, stats });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get campaign' }, { status: 500 });
  }
}

// PATCH /api/campaigns/[id] - Update campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    if (body.action === 'send') {
      const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any;
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      const members = db.prepare(`
        SELECT c.id, c.email, c.name
        FROM contacts c
        INNER JOIN contact_list_members clm ON c.id = clm.contact_id
        WHERE clm.contact_list_id = ?
      `).all(campaign.contact_list_id) as { id: string; email: string; name: string }[];

      const insertLog = db.prepare(`
        INSERT INTO email_logs (id, campaign_id, contact_id, contact_email, contact_name, status)
        VALUES (?, ?, ?, ?, ?, 'queued')
      `);

      const createLogs = db.transaction(() => {
        for (const member of members) {
          insertLog.run(uuidv4(), id, member.id, member.email, member.name);
        }
      });
      createLogs();

      db.prepare(`
        UPDATE campaigns SET status = 'sending', total_count = ?, sent_at = datetime('now') WHERE id = ?
      `).run(members.length, id);

      return NextResponse.json({ success: true, queued: members.length });
    }

    if (body.action === 'complete') {
      db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(body.status || 'sent', id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    // General campaign edit
    const fields: string[] = [];
    const values: any[] = [];
    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
    if (body.template_id !== undefined) { fields.push('template_id = ?'); values.push(body.template_id); }
    if (body.contact_list_id !== undefined) {
      fields.push('contact_list_id = ?');
      values.push(body.contact_list_id);
      const countResult = db.prepare('SELECT COUNT(*) as count FROM contact_list_members WHERE contact_list_id = ?').get(body.contact_list_id) as { count: number };
      fields.push('total_count = ?');
      values.push(countResult.count);
    }
    if (body.delay_seconds !== undefined) { fields.push('delay_seconds = ?'); values.push(body.delay_seconds); }
    if (body.reply_to !== undefined) { fields.push('reply_to = ?'); values.push(body.reply_to); }
    if (body.selected_smtp_ids !== undefined) {
      fields.push('selected_smtp_ids = ?');
      values.push(Array.isArray(body.selected_smtp_ids) && body.selected_smtp_ids.length > 0 ? JSON.stringify(body.selected_smtp_ids) : null);
    }
    if (body.enable_tracking !== undefined) { fields.push('enable_tracking = ?'); values.push(body.enable_tracking ? 1 : 0); }
    if (body.enable_unsubscribe !== undefined) { fields.push('enable_unsubscribe = ?'); values.push(body.enable_unsubscribe ? 1 : 0); }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    db.prepare(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

// DELETE /api/campaigns/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM email_opens WHERE tracking_id IN (SELECT tracking_id FROM email_logs WHERE campaign_id = ?)').run(id);
    db.prepare('DELETE FROM email_logs WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
