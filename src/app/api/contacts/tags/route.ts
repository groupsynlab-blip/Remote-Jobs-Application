import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const db = getDb();
  const tags = db.prepare(`
    SELECT t.*, COUNT(ctm.contact_id) as contact_count
    FROM contact_tags t LEFT JOIN contact_tag_members ctm ON t.id = ctm.tag_id
    GROUP BY t.id ORDER BY t.name
  `).all();
  return Response.json({ tags });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, tagId, name, color, contactIds } = body;
  const db = getDb();

  if (action === 'create') {
    if (!name) return Response.json({ error: 'Name required' }, { status: 400 });
    const id = uuidv4();
    db.prepare('INSERT INTO contact_tags (id, name, color) VALUES (?, ?, ?)').run(id, name, color || '#6366f1');
    return Response.json({ success: true, id });
  }

  if (action === 'delete' && tagId) {
    db.prepare('DELETE FROM contact_tags WHERE id = ?').run(tagId);
    return Response.json({ success: true });
  }

  if (action === 'add_contacts' && tagId && Array.isArray(contactIds)) {
    const stmt = db.prepare('INSERT OR IGNORE INTO contact_tag_members (tag_id, contact_id) VALUES (?, ?)');
    for (const cid of contactIds) stmt.run(tagId, cid);
    return Response.json({ success: true });
  }

  if (action === 'get_contacts' && tagId) {
    const contacts = db.prepare(`
      SELECT c.* FROM contacts c INNER JOIN contact_tag_members ctm ON c.id = ctm.contact_id WHERE ctm.tag_id = ?
    `).all(tagId);
    return Response.json({ contacts });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
