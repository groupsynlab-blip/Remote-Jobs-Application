import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/health — unauthenticated liveness endpoint.
 * Lets Railway healthchecks and uptime monitors verify the app is
 * serving without needing a session. Reports only non-sensitive data:
 * whether the SQLite database opens and its file size.
 */
export async function GET() {
  let db: { ok: boolean; sizeBytes?: number; error?: string } = { ok: false };
  try {
    const d = getDb();
    const row = d.prepare(
      'SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()'
    ).get() as { size: number };
    db = { ok: true, sizeBytes: row.size };
  } catch {
    db = { ok: false, error: 'db unreachable' };
  }
  return NextResponse.json({
    ok: true,
    service: 'bulk-emailer',
    db,
    time: new Date().toISOString(),
  });
}
