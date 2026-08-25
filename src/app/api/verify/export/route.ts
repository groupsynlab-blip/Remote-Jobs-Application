import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/verify/export?jobId=xxx&list=valid|invalid|risky|all
 * Streams verification results as a CSV download.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const list = searchParams.get('list') || 'all';
    
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const db = getDb();
    
    // Verify job exists
    const job = db.prepare('SELECT id, mode, status FROM verification_jobs WHERE id = ?').get(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Build query based on filter
    let whereClause = 'WHERE job_id = ?';
    const params: any[] = [jobId];
    
    if (list === 'valid') {
      whereClause += " AND status = 'valid'";
    } else if (list === 'invalid') {
      whereClause += " AND status = 'invalid'";
    } else if (list === 'risky') {
      whereClause += " AND status = 'risky'";
    }
    // 'all' = no additional filter
    
    const results = db.prepare(`
      SELECT email, status, syntax_valid, mx_valid, smtp_valid,
             is_disposable, is_role_account, is_catch_all, error_message
      FROM verification_results
      ${whereClause}
      ORDER BY id ASC
    `).all(...params) as any[];
    
    // Build CSV
    const csvHeader = 'email,status,syntax_valid,mx_valid,smtp_valid,is_disposable,is_role_account,is_catch_all,error_message\n';
    const csvRows = results.map(r => {
      return [
        escapeCsv(r.email),
        escapeCsv(r.status),
        r.syntax_valid ? 'true' : 'false',
        r.mx_valid ? 'true' : 'false',
        r.smtp_valid === null ? 'not_checked' : (r.smtp_valid ? 'true' : 'false'),
        r.is_disposable ? 'true' : 'false',
        r.is_role_account ? 'true' : 'false',
        r.is_catch_all === null ? 'not_checked' : (r.is_catch_all ? 'true' : 'false'),
        escapeCsv(r.error_message || ''),
      ].join(',');
    }).join('\n');
    
    const csv = csvHeader + csvRows;
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="verification-${list}-${jobId.slice(0, 8)}.csv"`,
      },
    });
    
  } catch (error: any) {
    console.error('[Export API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to export results' }, { status: 500 });
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
