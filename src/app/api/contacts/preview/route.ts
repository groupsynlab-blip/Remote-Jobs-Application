import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvText, listName } = body;

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
    }

    const lines = csvText.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 });
    }

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

    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(parseCsvLine);

    const emailKeywords = ['email', 'e-mail', 'mail', 'address'];
    const nameKeywords = ['name', 'full_name', 'fullname', 'first_name', 'firstname', 'last_name', 'lastname', 'contact', 'person'];
    const phoneKeywords = ['phone', 'mobile', 'cell', 'telephone', 'tel', 'number'];
    const companyKeywords = ['company', 'organization', 'org', 'business', 'firm'];
    const titleKeywords = ['title', 'position', 'role', 'job', 'designation'];

    const detectType = (header: string): string => {
      const h = header.toLowerCase().replace(/[^a-z]/g, '');
      if (emailKeywords.some(k => h.includes(k))) return 'email';
      if (nameKeywords.some(k => h.includes(k))) return 'name';
      if (phoneKeywords.some(k => h.includes(k))) return 'phone';
      if (companyKeywords.some(k => h.includes(k))) return 'company';
      if (titleKeywords.some(k => h.includes(k))) return 'title';
      return 'other';
    };

    const columnMappings = headers.map((h: string, idx: number) => ({
      index: idx, header: h, detectedType: detectType(h),
    }));

    const previewRows = rows.slice(0, 20).map((row: string[]) => {
      const obj: Record<string, string> = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] || ''; });
      return obj;
    });

    const db = getDb();
    const emailColumnIdx = columnMappings.findIndex(c => c.detectedType === 'email');

    const allEmails: string[] = [];
    const emailRows: { row: number; email: string }[] = [];
    rows.forEach((row: string[], idx: number) => {
      if (emailColumnIdx >= 0 && row[emailColumnIdx]) {
        const email = row[emailColumnIdx].toLowerCase().trim();
        if (email.includes('@') && email.includes('.')) {
          allEmails.push(email);
          emailRows.push({ row: idx + 2, email });
        }
      }
    });

    const emailCountMap = new Map<string, number>();
    allEmails.forEach(e => emailCountMap.set(e, (emailCountMap.get(e) || 0) + 1));
    const internalDuplicates = Array.from(emailCountMap.entries())
      .filter(([, count]) => count > 1)
      .map(([email, count]) => ({ email, count }));

    const existingEmails = new Set<string>();
    if (allEmails.length > 0) {
      for (let i = 0; i < allEmails.length; i += 500) {
        const chunk = allEmails.slice(i, i + 500);
        const placeholders = chunk.map(() => '?').join(',');
        const existing = db.prepare(
          `SELECT email FROM contacts WHERE email IN (${placeholders})`
        ).all(...chunk) as { email: string }[];
        existing.forEach(e => existingEmails.add(e.email.toLowerCase()));
      }
    }

    const uniqueDbDuplicates = [...new Set(allEmails.filter(e => existingEmails.has(e)))];

    const invalidEmails: { row: number; email: string; reason: string }[] = [];
    const validEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    emailRows.forEach(({ row, email }) => {
      if (!validEmailRegex.test(email)) {
        invalidEmails.push({ row, email, reason: 'Invalid format' });
      }
    });

    const cleanListName = listName?.trim() || `CSV Import ${new Date().toLocaleDateString()}`;

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      headers,
      columnMappings,
      previewRows,
      emailCount: allEmails.length,
      duplicateStats: {
        internalDuplicates,
        dbDuplicates: uniqueDbDuplicates,
        totalDuplicates: uniqueDbDuplicates.length,
      },
      invalidEmails: invalidEmails.slice(0, 50),
      cleanListName,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to parse CSV' }, { status: 500 });
  }
}
