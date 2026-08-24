import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/export?type=contacts&listId=xxx — export contacts as CSV
 * GET /api/export?type=campaign&campaignId=xxx — export campaign logs as CSV
 * GET /api/export?type=analytics — export analytics as CSV
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const listId = searchParams.get('listId');
  const campaignId = searchParams.get('campaignId');

  try {
    const db = getDb();
    let csv = '';
    let filename = 'export.csv';

    if (type === 'contacts') {
      const whereClause = listId
        ? 'WHERE clm.contact_list_id = ?' : '';
      const params = listId ? [listId] : [];

      const contacts = db.prepare(`
        SELECT c.email, c.name, c.created_at
        FROM contacts c
        ${listId ? 'INNER JOIN contact_list_members clm ON c.id = clm.contact_id' : ''}
        ${whereClause}
        ORDER BY c.created_at DESC
      `).all(...params) as any[];

      csv = 'Email,Name,Created At\n';
      contacts.forEach(c => {
        csv += `"${c.email}","${c.name || ''}","${c.created_at || ''}"\n`;
      });
      filename = listId ? `contacts-${listId.slice(0, 8)}.csv` : 'all-contacts.csv';

    } else if (type === 'campaign' && campaignId) {
      const logs = db.prepare(`
        SELECT el.contact_email, el.contact_name, el.status, el.error_message,
          el.subject_used, el.sent_at, el.smtp_config_id
        FROM email_logs el
        WHERE el.campaign_id = ?
        ORDER BY el.sent_at DESC
      `).all(campaignId) as any[];

      csv = 'Email,Name,Status,Error,Subject,Sent At,SMTP Config\n';
      logs.forEach(l => {
        csv += `"${l.contact_email}","${l.contact_name || ''}","${l.status}","${l.error_message || ''}","${l.subject_used || ''}","${l.sent_at || ''}","${l.smtp_config_id || ''}"\n`;
      });
      filename = `campaign-${campaignId.slice(0, 8)}.csv`;

    } else if (type === 'analytics') {
      const campaigns = db.prepare(`
        SELECT name, sent_count, failed_count, open_count,
          CASE WHEN sent_count > 0 THEN ROUND(open_count * 100.0 / sent_count, 1) ELSE 0 END as open_rate,
          created_at
        FROM campaigns ORDER BY created_at DESC
      `).all() as any[];

      csv = 'Campaign Name,Sent,Failed,Opens,Open Rate,Created At\n';
      campaigns.forEach(c => {
        csv += `"${c.name}",${c.sent_count},${c.failed_count},${c.open_count},${c.open_rate}%,"${c.created_at}"\n`;
      });
      filename = 'campaign-analytics.csv';

    } else {
      return Response.json({ error: 'Invalid export type' }, { status: 400 });
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (err: any) {
    return Response.json({ error: 'Export failed' }, { status: 500 });
  }
}
