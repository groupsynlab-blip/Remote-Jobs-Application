import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/settings — get all settings
export async function GET() {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[];
  const obj: Record<string, string> = {};
  for (const s of settings) obj[s.key] = s.value;
  return NextResponse.json(obj);
}

// POST /api/settings — update a setting
export async function POST(request: NextRequest) {
  const body = await request.json();
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(body.key, body.value);
  return NextResponse.json({ success: true });
}
