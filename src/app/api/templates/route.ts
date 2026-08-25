import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/templates - Get all templates
export async function GET() {
  try {
    const db = getDb();
    const templates = db.prepare('SELECT * FROM email_templates ORDER BY created_at DESC').all();
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get templates' }, { status: 500 });
  }
}

// POST /api/templates - Create template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    const id = uuidv4();
    
    db.prepare('INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)')
      .run(id, body.name, body.subject, body.body);
    
    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

// PUT /api/templates - Update template
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    
    db.prepare('UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE id = ?')
      .run(body.name, body.subject, body.body, body.id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

// DELETE /api/templates - Delete template
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const db = getDb();
    
    db.prepare('DELETE FROM email_templates WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
