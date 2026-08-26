import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/blacklist — list all blacklisted emails/domains
export async function GET() {
  const db = getDb();
  const items = db.prepare('SELECT * FROM email_blacklist ORDER BY created_at DESC').all();
  return NextResponse.json(items);
}

// POST /api/blacklist — add email or domain to blacklist
export async function POST(request: NextRequest) {
  const body = await request.json();
  const db = getDb();
  const id = uuidv4();

  if (body.email) {
    db.prepare('INSERT INTO email_blacklist (id, email, reason) VALUES (?, ?, ?)').run(id, body.email.toLowerCase(), body.reason || 'manual');
  } else if (body.domain) {
    db.prepare('INSERT INTO email_blacklist (id, domain, reason) VALUES (?, ?, ?)').run(id, body.domain.toLowerCase(), body.reason || 'manual');
  }

  return NextResponse.json({ success: true, id });
}

// DELETE /api/blacklist?id=xxx
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  getDb().prepare('DELETE FROM email_blacklist WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
