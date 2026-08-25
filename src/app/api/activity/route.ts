import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/scheduler';

/**
 * GET /api/activity — Unified view of all running operations.
 * Returns sending campaigns, verification jobs, and scrape jobs.
 */
export async function GET() {
  try {
    const db = getDb();
    const scheduler = getSchedulerStatus();

    // Active sending campaigns
    const sendingCampaigns = db.prepare(`
      SELECT c.id, c.name, c.status, c.total_count, c.sent_count, c.failed_count,
        c.created_at, c.sent_at,
        t.name as template_name, cl.name as list_name
      FROM campaigns c
      LEFT JOIN email_templates t ON c.template_id = t.id
      LEFT JOIN contact_lists cl ON c.contact_list_id = cl.id
      WHERE c.status IN ('sending', 'paused')
      ORDER BY c.sent_at DESC
    `).all() as any[];

    // Active verification jobs
    const verifyJobs = db.prepare(`
      SELECT id, mode, status, total_count, processed_count,
        valid_count, invalid_count, risky_count, created_at, completed_at
      FROM verification_jobs
      WHERE status IN ('pending', 'running')
      ORDER BY created_at DESC
    `).all() as any[];

    // Active scrape jobs
    const scrapeJobs = db.prepare(`
      SELECT id, mode, status, query, total_pages_scraped, total_emails_found,
        unique_emails, created_at, completed_at
      FROM scrape_jobs
      WHERE status IN ('pending', 'running')
      ORDER BY created_at DESC
    `).all() as any[];

    // Recent completed jobs (last 10 minutes)
    const recentCompleted = db.prepare(`
      SELECT 'verify' as type, id, mode as detail, status,
        total_count as total, processed_count as processed,
        created_at, completed_at
      FROM verification_jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND completed_at >= datetime('now', '-10 minutes')
      UNION ALL
      SELECT 'scrape' as type, id, query as detail, status,
        total_emails_found as total, total_pages_scraped as processed,
        created_at, completed_at
      FROM scrape_jobs
      WHERE status IN ('completed', 'failed')
        AND completed_at >= datetime('now', '-10 minutes')
      ORDER BY completed_at DESC
      LIMIT 10
    `).all() as any[];

    return NextResponse.json({
      scheduler,
      sending: sendingCampaigns,
      verifying: verifyJobs,
      scraping: scrapeJobs,
      recentCompleted,
      activeCount: sendingCampaigns.length + verifyJobs.length + scrapeJobs.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to get activity', detail: error.message }, { status: 500 });
  }
}
