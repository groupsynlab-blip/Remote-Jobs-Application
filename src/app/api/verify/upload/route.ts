import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/verify/upload
 * Accepts multipart/form-data with a file field "file"
 * Parses CSV (auto-detects email column) or TXT (one per line)
 * Returns { emails: string[], count: number }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
    }
    
    // Check file type
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.txt') && !name.endsWith('.tsv')) {
      return NextResponse.json({ error: 'Only .csv, .txt, and .tsv files are supported' }, { status: 400 });
    }
    
    const text = await file.text();
    const emails = parseEmailsFromText(text, name);
    
    // Deduplicate
    const uniqueEmails = [...new Set(emails)];
    
    return NextResponse.json({
      emails: uniqueEmails,
      count: uniqueEmails.length,
      totalLines: emails.length,
      duplicatesRemoved: emails.length - uniqueEmails.length,
    });
    
  } catch (error: any) {
    console.error('[Upload API] Error:', error.message);
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
  }
}

function parseEmailsFromText(text: string, filename: string): string[] {
  const lines = text.split(/[\r\n]+/).filter(l => l.trim().length > 0);
  
  if (lines.length === 0) return [];
  
  if (filename.endsWith('.csv') || filename.endsWith('.tsv')) {
    return parseCsvLines(lines);
  }
  
  // TXT: one email per line
  return lines
    .map(l => l.trim().toLowerCase())
    .filter(l => l.includes('@') && !l.startsWith('#') && !l.startsWith('//'));
}

function parseCsvLines(lines: string[]): string[] {
  if (lines.length === 0) return [];
  
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  // Find the email column
  let emailColIndex = header.findIndex(h =>
    h === 'email' || h === 'e-mail' || h === 'email_address' || h === 'emailaddress' || h === 'mail'
  );
  
  // If no email column found, try to find a column with @ signs
  if (emailColIndex === -1) {
    // Check first few data rows to find which column has emails
    const sampleRows = lines.slice(1, Math.min(6, lines.length));
    for (let col = 0; col < header.length; col++) {
      const hasEmails = sampleRows.some(row => {
        const fields = parseCsvRow(row, delimiter);
        return fields[col] && fields[col].includes('@');
      });
      if (hasEmails) {
        emailColIndex = col;
        break;
      }
    }
  }
  
  // If still no email column, check if first column itself contains emails
  if (emailColIndex === -1) {
    const hasEmailsInFirstCol = lines.slice(1, Math.min(6, lines.length)).some(row => {
      const fields = parseCsvRow(row, delimiter);
      return fields[0] && fields[0].includes('@');
    });
    if (hasEmailsInFirstCol) emailColIndex = 0;
  }
  
  if (emailColIndex === -1) {
    // Fallback: treat entire file as one-column emails
    return lines.slice(1)
      .map(l => l.trim().toLowerCase())
      .filter(l => l.includes('@'));
  }
  
  // Extract emails from the identified column
  return lines.slice(1)
    .map(line => {
      const fields = parseCsvRow(line, delimiter);
      return (fields[emailColIndex] || '').trim().toLowerCase();
    })
    .filter(email => email.length > 0 && email.includes('@') && email.includes('.'));
}

function parseCsvRow(row: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current.replace(/^['"]|['"]$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  fields.push(current.replace(/^['"]|['"]$/g, ''));
  return fields;
}
