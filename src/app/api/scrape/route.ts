import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { processScrapeJob, cancelScrapeJob } from '@/lib/scraper';
import type { ScrapeJob } from '@/lib/types';

/**
 * POST /api/scrape
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, mode, engines, maxResults, crawlDepth, country, fileType } = body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
    }
    
    if (mode !== 'search' && mode !== 'crawl') {
      return Response.json({ error: 'Invalid mode. Use "search" or "crawl"' }, { status: 400 });
    }
    
    const db = getDb();
    const jobId = uuidv4();
    
    db.prepare(`
      INSERT INTO scrape_jobs (id, mode, query, search_engines, max_results, crawl_depth)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobId, mode, query.trim(), engines ? JSON.stringify(engines) : null, maxResults || 200, crawlDepth || 1);
    
    // Store country and fileType in the query JSON for the scraper to use
    const meta: Record<string, any> = {};
    if (country) meta.country = country;
    if (fileType) meta.fileType = fileType;
    if (Object.keys(meta).length > 0) {
      db.prepare('UPDATE scrape_jobs SET search_engines = ? WHERE id = ?')
        .run(JSON.stringify({ engines: engines || ['duckduckgo', 'bing', 'brave'], ...meta }), jobId);
    }
    
    console.log(`[Scrape API] Created job ${jobId.slice(0, 8)}... (mode: ${mode})`);
    
    processScrapeJob(jobId).catch((err) => {
      console.error(`[Scrape API] Job ${jobId.slice(0, 8)}... failed:`, err.message);
      const db = getDb();
      db.prepare("UPDATE scrape_jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?").run(jobId);
    });
    
    return Response.json({ jobId, mode });
    
  } catch (error: any) {
    console.error('[Scrape API] POST error:', error.message);
    return Response.json({ error: 'Failed to create scrape job' }, { status: 500 });
  }
}

/**
 * GET /api/scrape?jobId=xxx — get specific job
 * GET /api/scrape — get most recent job (for reconnect)
 * GET /api/scrape?active=true — get all active jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const wantActive = searchParams.get('active');
    
    const db = getDb();
    
    // No jobId — return most recent job for reconnect
    if (!jobId && !wantActive) {
      const job = db.prepare(
        "SELECT * FROM scrape_jobs ORDER BY created_at DESC LIMIT 1"
      ).get() as ScrapeJob | undefined;
      
      if (!job) {
        return Response.json({ job: null });
      }
      return Response.json({ job });
    }
    
    // active=true — return all running jobs
    if (wantActive === 'true') {
      const jobs = db.prepare(
        "SELECT * FROM scrape_jobs WHERE status IN ('pending', 'running') ORDER BY created_at DESC"
      ).all() as ScrapeJob[];
      return Response.json({ jobs });
    }
    
    // Specific job
    if (!jobId) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const job = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(jobId) as ScrapeJob | undefined;
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    
    return Response.json({ job });
    
  } catch (error: any) {
    console.error('[Scrape API] GET error:', error.message);
    return Response.json({ error: 'Failed to get job status' }, { status: 500 });
  }
}

/**
 * DELETE /api/scrape?jobId=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }
    
    cancelScrapeJob(jobId);
    
    return Response.json({ success: true, message: 'Job cancellation requested' });
    
  } catch (error: any) {
    console.error('[Scrape API] DELETE error:', error.message);
    return Response.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
