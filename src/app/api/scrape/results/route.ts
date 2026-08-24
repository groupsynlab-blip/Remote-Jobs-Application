import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/scrape/results?jobId=xxx&page=0&limit=50
 * Returns paginated scrape results.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const db = getDb();
    
    const countRow = db.prepare(
      'SELECT COUNT(*) as total FROM scrape_results WHERE job_id = ?'
    ).get(jobId) as { total: number };
    
    const offset = page * limit;
    const results = db.prepare(`
      SELECT id, job_id, email, source_url, page_title, domain, search_engine, created_at
      FROM scrape_results
      WHERE job_id = ?
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `).all(jobId, limit, offset);
    
    // Get unique domain count
    const domainCount = db.prepare(
      'SELECT COUNT(DISTINCT domain) as count FROM scrape_results WHERE job_id = ?'
    ).get(jobId) as { count: number };
    
    return NextResponse.json({
      results,
      total: countRow.total,
      uniqueDomains: domainCount.count,
      page,
      limit,
      totalPages: Math.ceil(countRow.total / limit),
    });
    
  } catch (error: any) {
    console.error('[Scrape Results API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}
