import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/campaigns/[id]/send - Check campaign status or trigger send
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any;
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Check current status
    if (campaign.status === 'paused' || campaign.status === 'sending') {
      const queued = db.prepare(
        "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
      ).get(id) as { count: number };

      const sent = db.prepare(
        "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'sent'"
      ).get(id) as { count: number };

      if (queued.count === 0) {
        // All done
        db.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(id);
        return NextResponse.json({ done: true, sent: sent.count, failed: 0 });
      }

      return NextResponse.json({ paused: campaign.status === 'paused', queued: queued.count, sent: sent.count });
    }

    if (campaign.status === 'completed' || campaign.status === 'sent') {
      return NextResponse.json({ done: true });
    }

    return NextResponse.json({ status: campaign.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to check campaign' }, { status: 500 });
  }
}
