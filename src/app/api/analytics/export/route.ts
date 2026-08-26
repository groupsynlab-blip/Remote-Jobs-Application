import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'csv';
  const db = getDb();

  const campaigns = db.prepare(`
    SELECT c.*, t.name as template_name, cl.name as list_name
    FROM campaigns c
    LEFT JOIN email_templates t ON c.template_id = t.id
    LEFT JOIN contact_lists cl ON c.contact_list_id = cl.id
    ORDER BY c.created_at DESC
  `).all() as any[];

  if (format === 'csv') {
    const header = 'Campaign,Status,Total,Sent,Failed,Tags,Created,Sent At\n';
    const rows = campaigns.map(c =>
      `"${c.name}","${c.status}",${c.total_count || 0},${c.sent_count || 0},${c.failed_count || 0},"${c.tags || ''}","${c.created_at || ''}","${c.sent_at || ''}"`
    ).join('\n');

    return new Response(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="campaign-analytics-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  }

  return Response.json({ campaigns });
}
