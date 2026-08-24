import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/verify/results?jobId=xxx&list=all|valid|invalid|risky&page=0&limit=50
 * Returns paginated verification results for display in the UI.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const list = searchParams.get('list') || 'all';
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const db = getDb();
    
    // Build WHERE clause
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
    
    // Get total count
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM verification_results ${whereClause}`
    ).get(...params) as { total: number };
    
    // Get paginated results
    const offset = page * limit;
    const results = db.prepare(`
      SELECT id, job_id, email, status, syntax_valid, mx_valid, smtp_valid,
             is_disposable, is_role_account, is_catch_all, error_message
      FROM verification_results
      ${whereClause}
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    return NextResponse.json({
      results,
      total: countRow.total,
      page,
      limit,
      totalPages: Math.ceil(countRow.total / limit),
    });
    
  } catch (error: any) {
    console.error('[Results API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}
