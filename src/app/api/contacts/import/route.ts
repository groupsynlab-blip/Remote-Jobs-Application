import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvText: rawCsvText, listName, columnMapping, duplicateAction, createNewList, existingListId } = body;
    let csvText: string = typeof rawCsvText === 'string' ? rawCsvText : (rawCsvText == null ? '' : String(rawCsvText));

    if (!csvText || !columnMapping || columnMapping.email === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Normalize common .txt shapes (mirrors the client + preview normalization):
    // BOM, CRLF, tab/semicolon delimiters, headerless one-email-per-line lists.
    {
      let normalized = String(csvText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      const preLines = normalized.split('\n').filter((l: string) => l.trim());
      const firstLine = preLines[0] || '';
      const looksLikeEmail = (s: string) => /^[^\s,;@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
      if (!firstLine.includes(',')) {
        if (firstLine.includes('\t')) {
          normalized = preLines.map((l: string) => l.split('\t').map((c: string) => c.trim()).join(',')).join('\n');
        } else if (firstLine.includes(';')) {
          normalized = preLines.map((l: string) => l.split(';').map((c: string) => c.trim()).join(',')).join('\n');
        } else if (preLines.every(looksLikeEmail)) {
          const dataLines = looksLikeEmail(firstLine) ? preLines : preLines.slice(1);
          if (dataLines.length > 0) normalized = ['email', ...dataLines].join('\n');
        }
      }
      csvText = normalized;
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

    // Use SELECT to discover which optional columns actually exist on this DB,
    // so the import still works on older schemas that predate company/title.
    const contactColumns = db.prepare("PRAGMA table_info(contacts)").all() as { name: string }[];
    const hasCol = (name: string) => contactColumns.some(c => c.name === name);

    const insertContact = db.prepare(
      `INSERT INTO contacts (id, email, name${hasCol('phone') ? ', phone' : ''}${hasCol('company') ? ', company' : ''}${hasCol('title') ? ', title' : ''})
       VALUES (?, ?, ?${hasCol('phone') ? ', ?' : ''}${hasCol('company') ? ', ?' : ''}${hasCol('title') ? ', ?' : ''})`
    );

    const updateContact = db.prepare(
      `UPDATE contacts SET
        name = CASE WHEN ? != '' THEN ? ELSE name END${hasCol('phone') ? `,\n        phone = CASE WHEN ? != '' THEN ? ELSE phone END` : ''}${hasCol('company') ? `,\n        company = CASE WHEN ? != '' THEN ? ELSE company END` : ''}${hasCol('title') ? `,\n        title = CASE WHEN ? != '' THEN ? ELSE title END` : ''}
      WHERE email = ?`
    );

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
            const updateArgs: any[] = [contact.name, contact.name];
            if (hasCol('phone')) updateArgs.push(contact.phone, contact.phone);
            if (hasCol('company')) updateArgs.push(contact.company, contact.company);
            if (hasCol('title')) updateArgs.push(contact.title, contact.title);
            updateArgs.push(contact.email);
            updateContact.run(...updateArgs);
            updated++;
            insertMember.run(listId, existing.id);
            continue;
          }
        }
        const id = uuidv4();
        const insertArgs: any[] = [id, contact.email, contact.name];
        if (hasCol('phone')) insertArgs.push(contact.phone);
        if (hasCol('company')) insertArgs.push(contact.company);
        if (hasCol('title')) insertArgs.push(contact.title);
        insertContact.run(...insertArgs);
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
      columns: { hasCompany: hasCol('company'), hasTitle: hasCol('title'), hasPhone: hasCol('phone'), hasAddress: hasCol('address') },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to import contacts' }, { status: 500 });
  }
}
