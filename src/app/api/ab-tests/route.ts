import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

/** GET /api/ab-tests — list all A/B tests */
export async function GET() {
  const db = getDb();
  const tests = db.prepare(`
    SELECT ab.*, c.name as campaign_name
    FROM ab_tests ab
    LEFT JOIN campaigns c ON ab.campaign_id = c.id
    ORDER BY ab.created_at DESC
  `).all();
  return Response.json(tests);
}

/** POST /api/ab-tests — create an A/B test */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { 
    campaign_id, variant_a_subject, variant_b_subject,
    variant_a_body, variant_b_body, split_ratio, test_size
  } = body;

  if (!campaign_id || !variant_a_subject || !variant_b_subject) {
    return Response.json({ error: 'campaign_id, variant_a_subject, and variant_b_subject required' }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();

  // Get campaign info
  const campaign = db.prepare(`
    SELECT c.*, t.subject as template_subject, t.body as template_body
    FROM campaigns c LEFT JOIN email_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(campaign_id) as any;

  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

  // Get contact count
  const contactCount = (db.prepare(`
    SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ?
  `).get(campaign_id) as { count: number }).count;

  // Create A/B test
  db.prepare(`
    INSERT INTO ab_tests (id, campaign_id, variant_a_subject, variant_b_subject, variant_a_body, variant_b_body, split_ratio, test_size, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    id, campaign_id,
    variant_a_subject, variant_b_subject,
    variant_a_body || campaign.template_body || '',
    variant_b_body || campaign.template_body || '',
    split_ratio || 0.5,
    test_size || Math.min(100, contactCount)
  );

  // Split email_logs into variants
  const allLogs = db.prepare(
    'SELECT id FROM email_logs WHERE campaign_id = ? ORDER BY RANDOM()'
  ).all(campaign_id) as { id: string }[];

  const testSize = test_size || Math.min(100, allLogs.length);
  const variantASize = Math.ceil(testSize * (split_ratio || 0.5));

  // Tag logs with their variant
  for (let i = 0; i < allLogs.length; i++) {
    if (i < variantASize) {
      db.prepare("UPDATE email_logs SET subject_used = ? WHERE id = ?")
        .run(`[A] ${variant_a_subject}`, allLogs[i].id);
    } else if (i < testSize) {
      db.prepare("UPDATE email_logs SET subject_used = ? WHERE id = ?")
        .run(`[B] ${variant_b_subject}`, allLogs[i].id);
    }
  }

  return Response.json({ id, test_size: testSize, variant_a_size: variantASize, variant_b_size: testSize - variantASize }, { status: 201 });
}

/** DELETE /api/ab-tests?id=xxx */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  getDb().prepare('DELETE FROM ab_tests WHERE id = ?').run(id);
  return Response.json({ ok: true });
}
