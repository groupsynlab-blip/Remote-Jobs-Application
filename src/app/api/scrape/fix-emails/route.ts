import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/scrape/fix-emails?jobId=xxx
 * Apply email corrections to scraped results
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    
    const body = await request.json();
    const { corrections } = body as { corrections: Record<string, string> };
    
    if (!corrections || typeof corrections !== 'object') {
      return NextResponse.json({ error: 'corrections object required' }, { status: 400 });
    }
    
    const db = getDb();
    
    // Apply corrections in a transaction
    const applyCorrections = db.transaction(() => {
      let fixed = 0;
      
      for (const [original, corrected] of Object.entries(corrections)) {
        if (!original || !corrected || original === corrected) continue;
        
        // Check if the corrected email already exists for this job
        const existing = db.prepare(
          'SELECT id FROM scrape_results WHERE job_id = ? AND email = ?'
        ).get(jobId, corrected) as { id: number } | undefined;
        
        if (existing) {
          // Delete the original if corrected already exists
          db.prepare(
            'DELETE FROM scrape_results WHERE job_id = ? AND email = ?'
          ).run(jobId, original);
        } else {
          // Update the email to the corrected version
          db.prepare(
            'UPDATE scrape_results SET email = ?, domain = ? WHERE job_id = ? AND email = ?'
          ).run(corrected, corrected.split('@')[1] || '', jobId, original);
        }
        
        fixed++;
      }
      
      return fixed;
    });
    
    const fixed = applyCorrections();
    
    return NextResponse.json({ success: true, fixed });
    
  } catch (error: any) {
    console.error('[Fix Emails API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to apply corrections' }, { status: 500 });
  }
}
