import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/** GET /api/ab-tests/[id]/results — get detailed results and auto-select winner */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const test = db.prepare(`
    SELECT ab.*, c.name as campaign_name
    FROM ab_tests ab
    LEFT JOIN campaigns c ON ab.campaign_id = c.id
    WHERE ab.id = ?
  `).get(id) as any;

  if (!test) return Response.json({ error: 'Not found' }, { status: 404 });

  // Count opens per variant
  const variantAOpens = (db.prepare(`
    SELECT COUNT(*) as count FROM email_opens eo
    JOIN email_logs el ON eo.tracking_id = el.tracking_id
    WHERE el.campaign_id = ? AND el.subject_used LIKE ?
  `).get(test.campaign_id, `[A]%`) as { count: number }).count;

  const variantBOpens = (db.prepare(`
    SELECT COUNT(*) as count FROM email_opens eo
    JOIN email_logs el ON eo.tracking_id = el.tracking_id
    WHERE el.campaign_id = ? AND el.subject_used LIKE ?
  `).get(test.campaign_id, `[B]%`) as { count: number }).count;

  // Count sent/failed per variant
  const variantASent = (db.prepare(`
    SELECT COUNT(*) as count FROM email_logs
    WHERE campaign_id = ? AND subject_used LIKE ? AND status = 'sent'
  `).get(test.campaign_id, `[A]%`) as { count: number }).count;

  const variantBSent = (db.prepare(`
    SELECT COUNT(*) as count FROM email_logs
    WHERE campaign_id = ? AND subject_used LIKE ? AND status = 'sent'
  `).get(test.campaign_id, `[B]%`) as { count: number }).count;

  const variantAFails = (db.prepare(`
    SELECT COUNT(*) as count FROM email_logs
    WHERE campaign_id = ? AND subject_used LIKE ? AND status = 'failed'
  `).get(test.campaign_id, `[A]%`) as { count: number }).count;

  const variantBFails = (db.prepare(`
    SELECT COUNT(*) as count FROM email_logs
    WHERE campaign_id = ? AND subject_used LIKE ? AND status = 'failed'
  `).get(test.campaign_id, `[B]%`) as { count: number }).count;

  const variantAOpenRate = variantASent > 0 ? (variantAOpens / variantASent * 100) : 0;
  const variantBOpenRate = variantBSent > 0 ? (variantBOpens / variantBSent * 100) : 0;

  // Auto-select winner if test is done (all test emails sent)
  let winner = test.winner;
  if (!winner && variantASent + variantBSent >= test.test_size && variantASent > 0 && variantBSent > 0) {
    // Need at least 10 emails per variant to call a winner
    if (variantASent >= 10 && variantBSent >= 10) {
      winner = variantAOpenRate >= variantBOpenRate ? 'A' : 'B';
      db.prepare("UPDATE ab_tests SET status = 'completed', winner = ?, completed_at = datetime('now'), variant_a_opens = ?, variant_b_opens = ?, variant_a_sent = ?, variant_b_sent = ?, variant_a_fails = ?, variant_b_fails = ? WHERE id = ?")
        .run(winner, variantAOpens, variantBOpens, variantASent, variantBSent, variantAFails, variantBFails, id);
    }
  }

  return Response.json({
    ...test,
    variant_a: {
      subject: test.variant_a_subject,
      sent: variantASent,
      opens: variantAOpens,
      fails: variantAFails,
      open_rate: variantAOpenRate.toFixed(1),
    },
    variant_b: {
      subject: test.variant_b_subject,
      sent: variantBSent,
      opens: variantBOpens,
      fails: variantBFails,
      open_rate: variantBOpenRate.toFixed(1),
    },
    winner,
    is_complete: variantASent + variantBSent >= test.test_size,
  });
}
