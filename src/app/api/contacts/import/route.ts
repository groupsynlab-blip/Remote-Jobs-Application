import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvText, listName, columnMapping, duplicateAction, createNewList, existingListId } = body;

    if (!csvText || !columnMapping || columnMapping.email === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
          else if (ch === '"') { inQuotes = false; }
          else { current += ch; }
        } else {
          if (ch === '"') { inQuotes = true; }
          else if (ch === ',') { result.push(current.trim()); current = ''; }
          else { current += ch; }
        }
      }
      result.push(current.trim());
      return result;
    };

    const lines = csvText.split('\n').filter((l: string) => l.trim());
    const rows = lines.slice(1).map(parseCsvLine);

    const contacts = rows.map((row: string[]) => {
      const email = (row[columnMapping.email] || '').toLowerCase().trim();
      const name = columnMapping.name != null ? (row[columnMapping.name] || '').trim() : '';
      const phone = columnMapping.phone != null ? (row[columnMapping.phone] || '').trim() : '';
      const company = columnMapping.company != null ? (row[columnMapping.company] || '').trim() : '';
      const title = columnMapping.title != null ? (row[columnMapping.title] || '').trim() : '';
      return { email, name, phone, company, title };
    }).filter((c: { email: string; name: string; phone: string; company: string; title: string }) => c.email && c.email.includes('@') && c.email.includes('.'));

    const seen = new Set<string>();
    const uniqueContacts = contacts.filter((c: { email: string; name: string; phone: string; company: string; title: string }) => {
      if (seen.has(c.email)) return false;
      seen.add(c.email);
      return true;
    });

    const existingMap = new Map<string, any>();
    for (let i = 0; i < uniqueContacts.length; i += 500) {
      const chunk = uniqueContacts.slice(i, i + 500).map((c: { email: string }) => c.email);
      const placeholders = chunk.map(() => '?').join(',');
      const existing = db.prepare(
        `SELECT id, email, name, phone, company, title FROM contacts WHERE email IN (${placeholders})`
      ).all(...chunk) as any[];
      existing.forEach(e => existingMap.set(e.email.toLowerCase(), e));
    }

    let listId: string;
    let finalListName: string;

    if (createNewList && !existingListId) {
      listId = uuidv4();
      finalListName = listName || `CSV Import ${new Date().toLocaleDateString()}`;
      db.prepare('INSERT INTO contact_lists (id, name) VALUES (?, ?)').run(listId, finalListName);
    } else if (existingListId) {
      listId = existingListId;
      const list = db.prepare('SELECT name FROM contact_lists WHERE id = ?').get(existingListId) as any;
      finalListName = list?.name || 'Existing List';
    } else {
      listId = uuidv4();
      finalListName = listName || `CSV Import ${new Date().toLocaleDateString()}`;
      db.prepare('INSERT INTO contact_lists (id, name) VALUES (?, ?)').run(listId, finalListName);
    }

    const insertContact = db.prepare(`
      INSERT INTO contacts (id, email, name, phone, company, title) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = CASE WHEN excluded.name != '' THEN excluded.name ELSE contacts.name END,
        phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE contacts.phone END,
        company = CASE WHEN excluded.company != '' THEN excluded.company ELSE contacts.company END,
        title = CASE WHEN excluded.title != '' THEN excluded.title ELSE contacts.title END
    `);

    const updateContact = db.prepare(`
      UPDATE contacts SET
        name = CASE WHEN ? != '' THEN ? ELSE name END,
        phone = CASE WHEN ? != '' THEN ? ELSE phone END,
        company = CASE WHEN ? != '' THEN ? ELSE company END,
        title = CASE WHEN ? != '' THEN ? ELSE title END
      WHERE email = ?
    `);

    const getContactId = db.prepare('SELECT id FROM contacts WHERE email = ?');
    const insertMember = db.prepare(
      'INSERT OR IGNORE INTO contact_list_members (contact_list_id, contact_id) VALUES (?, ?)'
    );

    let imported = 0;
    let skipped = 0;
    let updated = 0;

    const importTransaction = db.transaction(() => {
      for (const contact of uniqueContacts) {
        const existing = existingMap.get(contact.email);
        if (existing) {
          if (duplicateAction === 'skip') {
            skipped++;
            insertMember.run(listId, existing.id);
            continue;
          } else if (duplicateAction === 'update') {
            updateContact.run(
              contact.name, contact.name,
              contact.phone, contact.phone,
              contact.company, contact.company,
              contact.title, contact.title,
              contact.email
            );
            updated++;
            insertMember.run(listId, existing.id);
            continue;
          }
        }
        const id = uuidv4();
        insertContact.run(id, contact.email, contact.name, contact.phone, contact.company, contact.title);
        const contactRow = getContactId.get(contact.email) as { id: string } | undefined;
        if (contactRow) {
          insertMember.run(listId, contactRow.id);
          imported++;
        }
      }
    });

    importTransaction();

    return NextResponse.json({
      success: true, listId, listName: finalListName,
      imported, updated, skipped, total: uniqueContacts.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to import contacts' }, { status: 500 });
  }
}
