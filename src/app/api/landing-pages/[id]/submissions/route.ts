import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/** GET /api/landing-pages/[id]/submissions — get all submissions for a landing page */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const submissions = db.prepare(`
    SELECT * FROM landing_submissions
    WHERE landing_page_id = ?
    ORDER BY created_at DESC
  `).all(id);

  return Response.json(submissions);
}
