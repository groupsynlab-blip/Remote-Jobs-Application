import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { createTransporter, renderTemplate, recordSmtpSend } from '@/lib/email';

/** GET /api/warmup — list all warmup configs */
export async function GET() {
  const db = getDb();
  const configs = db.prepare(`
    SELECT w.*, sc.name as smtp_name, sc.from_email, sc.host
    FROM warmup_configs w
    LEFT JOIN smtp_config sc ON w.smtp_config_id = sc.id
    ORDER BY w.created_at DESC
  `).all();

  // Attach daily stats
  const result = configs.map((c: any) => {
    const todaySent = (db.prepare(
      "SELECT COUNT(*) as count FROM warmup_logs WHERE warmup_id = ? AND sent_at >= date('now')"
    ).get(c.id) as { count: number }).count;

    const totalSent = (db.prepare(
      'SELECT COUNT(*) as count FROM warmup_logs WHERE warmup_id = ?'
    ).get(c.id) as { count: number }).count;

    const failedCount = (db.prepare(
      "SELECT COUNT(*) as count FROM warmup_logs WHERE warmup_id = ? AND status = 'failed'"
    ).get(c.id) as { count: number }).count;

    return { ...c, today_sent: todaySent, total_sent: totalSent, failed_count: failedCount };
  });

  return Response.json(result);
}

/** POST /api/warmup — create a new warmup config */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { smtp_config_id, daily_limit, total_days } = body;

  if (!smtp_config_id) {
    return Response.json({ error: 'SMTP config required' }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO warmup_configs (id, smtp_config_id, daily_limit, total_days)
    VALUES (?, ?, ?, ?)
  `).run(id, smtp_config_id, daily_limit || 5, total_days || 30);

  return Response.json({ id }, { status: 201 });
}

/** POST /api/warmup with action=start|stop|send-now|delete */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  getDb().prepare('DELETE FROM warmup_configs WHERE id = ?').run(id);
  return Response.json({ ok: true });
}
