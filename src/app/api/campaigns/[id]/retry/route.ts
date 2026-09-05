import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/campaigns/[id]/retry - Re-queue only failed emails
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // Count failed emails
    const failed = db.prepare(
      "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status IN ('failed', 'skipped')"
    ).get(id) as { count: number };

    if (failed.count === 0) {
      return NextResponse.json({ success: true, requeued: 0, message: 'No failed emails to retry' });
    }

    // Reset failed emails back to queued
    const result = db.prepare(
      "UPDATE email_logs SET status = 'queued', error_message = NULL, sent_at = NULL, smtp_config_id = NULL WHERE campaign_id = ? AND status IN ('failed', 'skipped')"
    ).run(id);

    // Update campaign status to sending
    db.prepare(
      "UPDATE campaigns SET status = 'sending' WHERE id = ?"
    ).run(id);

    return NextResponse.json({
      success: true,
      requeued: result.changes,
      message: `Re-queued ${result.changes} failed emails for retry`,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retry failed emails' }, { status: 500 });
  }
}
