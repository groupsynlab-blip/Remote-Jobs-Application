import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

/** GET /api/landing-pages — list all landing pages */
export async function GET() {
  const db = getDb();
  const pages = db.prepare(`
    SELECT lp.*, cl.name as list_name
    FROM landing_pages lp
    LEFT JOIN contact_lists cl ON lp.target_list_id = cl.id
    ORDER BY lp.created_at DESC
  `).all();
  return Response.json(pages);
}

/** POST /api/landing-pages — create a landing page */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, slug, title, description, form_fields, success_message, theme, custom_css, target_list_id } = body;

  if (!name || !slug) {
    return Response.json({ error: 'Name and slug are required' }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();
  
  try {
    db.prepare(`
      INSERT INTO landing_pages (id, name, slug, title, description, form_fields, success_message, theme, custom_css, target_list_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      title || name, description || '',
      JSON.stringify(form_fields || ['email', 'name']),
      success_message || 'Thank you for submitting!',
      theme || 'default', custom_css || '',
      target_list_id || null
    );
    return Response.json({ id, slug }, { status: 201 });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'Slug already exists' }, { status: 409 });
    }
    throw e;
  }
}

/** PUT /api/landing-pages — update a landing page */
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, slug, title, description, form_fields, success_message, target_list_id } = body;

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    UPDATE landing_pages SET
      name = COALESCE(?, name),
      slug = COALESCE(?, slug),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      form_fields = COALESCE(?, form_fields),
      success_message = COALESCE(?, success_message),
      target_list_id = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name || null,
    slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '-') : null,
    title || null,
    description || null,
    form_fields ? JSON.stringify(form_fields) : null,
    success_message || null,
    target_list_id || null,
    id
  );

  return Response.json({ ok: true });
}

/** DELETE /api/landing-pages?id=xxx */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  getDb().prepare('DELETE FROM landing_pages WHERE id = ?').run(id);
  return Response.json({ ok: true });
}
