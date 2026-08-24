import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/contacts - Get all contacts
export async function GET() {
  try {
    const db = getDb();
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
    const lists = db.prepare('SELECT * FROM contact_lists ORDER BY created_at DESC').all();
    
    // Get member counts for each list
    const listCounts = db.prepare(`
      SELECT contact_list_id, COUNT(*) as count 
      FROM contact_list_members 
      GROUP BY contact_list_id
    `).all() as { contact_list_id: string; count: number }[];
    
    const countMap = Object.fromEntries(listCounts.map(l => [l.contact_list_id, l.count]));
    const listsWithCounts = lists.map((l: any) => ({ ...l, member_count: countMap[l.id] || 0 }));

    return NextResponse.json({ contacts, lists: listsWithCounts });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get contacts' }, { status: 500 });
  }
}

// POST /api/contacts - Create contact or import CSV
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    
    if (body.action === 'import_csv' && body.contacts) {
      // Bulk import contacts
      const insertContact = db.prepare(`
        INSERT OR IGNORE INTO contacts (id, email, name) VALUES (?, ?, ?)
      `);
      const insertList = db.prepare(`
        INSERT INTO contact_lists (id, name) VALUES (?, ?)
      `);
      const insertMember = db.prepare(`
        INSERT OR IGNORE INTO contact_list_members (contact_list_id, contact_id) VALUES (?, ?)
      `);
      const getContact = db.prepare('SELECT id FROM contacts WHERE email = ?');

      const listId = uuidv4();
      const listName = body.list_name || `Import ${new Date().toISOString().split('T')[0]}`;

      const importTransaction = db.transaction(() => {
        insertList.run(listId, listName);
        let imported = 0;
        
        for (const contact of body.contacts) {
          const email = contact.email?.trim();
          const name = contact.name?.trim() || '';
          if (!email) continue;
          
          insertContact.run(uuidv4(), email, name);
          const existing = getContact.get(email) as { id: string } | undefined;
          if (existing) {
            insertMember.run(listId, existing.id);
          }
          imported++;
        }
        
        return { listId, listName, imported };
      });

      const result = importTransaction();
      return NextResponse.json({ success: true, ...result });
    }
    
    if (body.action === 'create_list') {
      const id = uuidv4();
      db.prepare('INSERT INTO contact_lists (id, name) VALUES (?, ?)').run(id, body.name);
      return NextResponse.json({ success: true, id });
    }

    if (body.action === 'add_to_list') {
      db.prepare('INSERT OR IGNORE INTO contact_list_members (contact_list_id, contact_id) VALUES (?, ?)')
        .run(body.list_id, body.contact_id);
      return NextResponse.json({ success: true });
    }

    // Single contact creation
    const id = uuidv4();
    db.prepare('INSERT INTO contacts (id, email, name) VALUES (?, ?, ?)')
      .run(id, body.email, body.name || '');
    
    // Add to list if specified
    if (body.list_id) {
      db.prepare('INSERT OR IGNORE INTO contact_list_members (contact_list_id, contact_id) VALUES (?, ?)')
        .run(body.list_id, id);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}

// DELETE /api/contacts - Delete contacts or list
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'contact';
    const db = getDb();

    if (type === 'list') {
      db.prepare('DELETE FROM contact_lists WHERE id = ?').run(id);
    } else if (type === 'contact') {
      db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
