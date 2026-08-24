import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/scrape/export?jobId=xxx
 * Exports all scrape results as a CSV download.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const db = getDb();
    
    const job = db.prepare('SELECT id, mode FROM scrape_jobs WHERE id = ?').get(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    const results = db.prepare(`
      SELECT email, source_url, page_title, domain, search_engine, created_at
      FROM scrape_results
      WHERE job_id = ?
      ORDER BY id ASC
    `).all(jobId) as any[];
    
    // Build CSV
    const csvHeader = 'email,source_url,page_title,domain,search_engine,scraped_at\n';
    const csvRows = results.map(r => [
      escapeCsv(r.email),
      escapeCsv(r.source_url),
      escapeCsv(r.page_title || ''),
      escapeCsv(r.domain),
      escapeCsv(r.search_engine || ''),
      escapeCsv(r.created_at),
    ].join(',')).join('\n');
    
    const csv = csvHeader + csvRows;
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="scrape-results-${jobId.slice(0, 8)}.csv"`,
      },
    });
    
  } catch (error: any) {
    console.error('[Scrape Export API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to export results' }, { status: 500 });
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
