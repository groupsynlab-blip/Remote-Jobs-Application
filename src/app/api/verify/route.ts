import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { processVerificationJob, cancelJob, isJobActive } from '@/lib/verifier';
import { suggestCorrections } from '@/lib/email-autocomplete';
import type { VerificationJob } from '@/lib/types';

/**
 * POST /api/verify
 * Body: { emails: string[], mode: 'quick' | 'thorough' }
 */
export async function POST(request: NextRequest) {
  const V2_AUTOFIX_MARKER = true; // v2: auto-fix typos before verification
  try {
    const body = await request.json();
    const { emails, mode } = body;
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'No emails provided' }, { status: 400 });
    }
    
    if (mode !== 'quick' && mode !== 'thorough') {
      return NextResponse.json({ error: 'Invalid mode. Use "quick" or "thorough"' }, { status: 400 });
    }
    
    if (emails.length > 200000) {
      return NextResponse.json({ error: 'Maximum 200,000 emails per job' }, { status: 400 });
    }
    
    const rawEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))].filter(e => e.length > 0 && e.includes('@'));
    
    if (rawEmails.length === 0) {
      return NextResponse.json({ error: 'No valid emails found' }, { status: 400 });
    }
    
    // Auto-fix: correct high-confidence typos and malformed emails
    const autoFix = body.autoFix !== false; // enabled by default
    const corrections: Array<{ original: string; corrected: string; reason: string }> = [];
    const uniqueEmails = rawEmails.map(email => {
      if (!autoFix) return email;
      const suggestions = suggestCorrections(email);
      const highConfidence = suggestions.find(s => s.confidence === 'high');
      if (highConfidence && highConfidence.corrected !== email) {
        corrections.push({ original: email, corrected: highConfidence.corrected, reason: highConfidence.reason });
        return highConfidence.corrected;
      }
      return email;
    });
    // Deduplicate again after fixes
    const deduplicated = [...new Set(uniqueEmails)];
    
    const db = getDb();
    const jobId = uuidv4();
    
    db.prepare(`
      INSERT INTO verification_jobs (id, mode, status, total_count)
      VALUES (?, ?, 'pending', ?)
    `).run(jobId, mode, deduplicated.length);
    
    const insertStmt = db.prepare(`
      INSERT INTO verification_results (job_id, email, status)
      VALUES (?, ?, 'pending')
    `);
    
    const insertAll = db.transaction(() => {
      for (const email of deduplicated) {
        insertStmt.run(jobId, email);
      }
    });
    insertAll();
    
    console.log(`[V2] [Verify API] Created job ${jobId.slice(0, 8)}... with ${deduplicated.length} emails (mode: ${mode})${corrections.length > 0 ? `, ${corrections.length} auto-fixed` : ''}`);
    
    processVerificationJob(jobId).catch((err) => {
      console.error(`[Verify API] Job ${jobId.slice(0, 8)}... failed:`, err.message);
      const db = getDb();
      db.prepare("UPDATE verification_jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?").run(jobId);
    });
    
    return NextResponse.json({ jobId, totalEmails: deduplicated.length, mode, corrections });
    
  } catch (error: any) {
    console.error('[Verify API] POST error:', error.message);
    return NextResponse.json({ error: 'Failed to create verification job' }, { status: 500 });
  }
}

/**
 * GET /api/verify?jobId=xxx — get specific job
 * GET /api/verify — get latest active/running job (for reconnect)
 * GET /api/verify?active=true — get all active jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const wantActive = searchParams.get('active');
    
    const db = getDb();
    
    // No jobId and no active flag — return most recent job for reconnect
    if (!jobId && !wantActive) {
      const job = db.prepare(
        "SELECT * FROM verification_jobs ORDER BY created_at DESC LIMIT 1"
      ).get() as VerificationJob | undefined;
      
      if (!job) {
        return Response.json({ job: null });
      }
      return Response.json({ job });
    }
    
    // active=true — return all running jobs
    if (wantActive === 'true') {
      const jobs = db.prepare(
        "SELECT * FROM verification_jobs WHERE status IN ('pending', 'running') ORDER BY created_at DESC"
      ).all() as VerificationJob[];
      return Response.json({ jobs });
    }
    
    // Specific job
    if (!jobId) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const job = db.prepare('SELECT * FROM verification_jobs WHERE id = ?').get(jobId) as VerificationJob | undefined;
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    
    return Response.json({ job });
    
  } catch (error: any) {
    console.error('[Verify API] GET error:', error.message);
    return Response.json({ error: 'Failed to get job status' }, { status: 500 });
  }
}

/**
 * DELETE /api/verify?jobId=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }
    
    cancelJob(jobId);
    
    return Response.json({ success: true, message: 'Job cancellation requested' });
    
  } catch (error: any) {
    console.error('[Verify API] DELETE error:', error.message);
    return Response.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
