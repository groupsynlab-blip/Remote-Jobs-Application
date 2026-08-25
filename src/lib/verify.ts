import dns from 'dns';
import net from 'net';
import { getDb } from './db';

// ─── Syntax Validation ────────────────────────────────────────────
export function validateSyntax(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Empty email' };
  }

  const trimmed = email.trim().toLowerCase();

  // Basic structure check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Check for common mistakes
  if (trimmed.includes('..')) {
    return { valid: false, error: 'Invalid: consecutive dots' };
  }

  const [localPart, domain] = trimmed.split('@');

  if (localPart.length === 0) {
    return { valid: false, error: 'Empty local part' };
  }
  if (localPart.length > 64) {
    return { valid: false, error: 'Local part too long (max 64)' };
  }
  if (domain.length > 253) {
    return { valid: false, error: 'Domain too long (max 253)' };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(domain)) {
    return { valid: false, error: 'Invalid domain format' };
  }

  return { valid: true };
}

// ─── MX Record Check ──────────────────────────────────────────────
export function checkMxRecords(domain: string): Promise<{ valid: boolean; mxHosts?: string[]; error?: string }> {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve({ valid: false, error: `No MX records found for ${domain}` });
        return;
      }

      // Sort by priority (lowest first)
      const sorted = addresses.sort((a, b) => a.priority - b.priority);
      const mxHosts = sorted.map((a) => a.exchange);

      resolve({ valid: true, mxHosts });
    });
  });
}

// ─── SMTP Mailbox Verification ────────────────────────────────────
export function verifySmtp(
  email: string,
  mxHost: string,
  fromEmail: string = 'verify@example.com',
  timeoutMs: number = 10000
): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let buffer = '';
    let resolved = false;

    const done = (valid: boolean, error?: string) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve({ valid, error });
    };

    const timeout = setTimeout(() => {
      done(false, `Connection timeout to ${mxHost}`);
    }, timeoutMs);

    socket.setEncoding('ascii');

    socket.on('connect', () => {
      // Wait for server greeting
    });

    socket.on('data', (data) => {
      buffer += data;
      if (!buffer.endsWith('\r\n') && !buffer.endsWith(' ')) return;

      const code = parseInt(buffer.substring(0, 3), 10);
      buffer = '';

      if (step === 0 && code === 220) {
        // Server ready, send EHLO
        step = 1;
        socket.write(`EHLO ${fromEmail.split('@')[1] || 'localhost'}\r\n`);
      } else if (step === 1 && code === 250) {
        // EHLO accepted, send MAIL FROM
        step = 2;
        socket.write(`MAIL FROM:<${fromEmail}>\r\n`);
      } else if (step === 2 && code === 250) {
        // MAIL FROM accepted, send RCPT TO
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        // RCPT TO response — this is the key check
        clearTimeout(timeout);
        if (code === 250 || code === 251) {
          // Send QUIT before resolving
          socket.write('QUIT\r\n');
          done(true);
        } else if (code === 550 || code === 551 || code === 552 || code === 553) {
          socket.write('QUIT\r\n');
          done(false, `Mailbox not found (${code})`);
        } else {
          // Some servers return 4xx for temp errors or other codes
          socket.write('QUIT\r\n');
          done(false, `SMTP verification inconclusive (${code})`);
        }
      } else if (step < 3) {
        // Unexpected response
        clearTimeout(timeout);
        socket.write('QUIT\r\n');
        done(false, `SMTP error at step ${step} (${code})`);
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      done(false, `Connection error: ${err.message}`);
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      if (!resolved) {
        done(false, 'Connection closed unexpectedly');
      }
    });
  });
}

// ─── Combined Email Verification ──────────────────────────────────
export type VerifyResult = {
  email: string;
  syntax: boolean;
  syntax_error?: string;
  mx: boolean;
  mx_error?: string;
  smtp: boolean;
  smtp_error?: string;
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  checked_at: string;
};

export async function verifyEmail(
  email: string,
  skipSmtp: boolean = false
): Promise<VerifyResult> {
  const result: VerifyResult = {
    email: email.trim().toLowerCase(),
    syntax: false,
    mx: false,
    smtp: false,
    status: 'unknown',
    checked_at: new Date().toISOString(),
  };

  // Step 1: Syntax check
  const syntaxCheck = validateSyntax(email);
  result.syntax = syntaxCheck.valid;
  result.syntax_error = syntaxCheck.error;

  if (!syntaxCheck.valid) {
    result.status = 'invalid';
    return result;
  }

  // Step 2: MX record check
  const domain = email.split('@')[1];
  const mxCheck = await checkMxRecords(domain);
  result.mx = mxCheck.valid;
  result.mx_error = mxCheck.error;

  if (!mxCheck.valid) {
    result.status = 'invalid';
    return result;
  }

  // Step 3: SMTP verification (optional, slower)
  if (!skipSmtp && mxCheck.mxHosts && mxCheck.mxHosts.length > 0) {
    const smtpCheck = await verifySmtp(email, mxCheck.mxHosts[0]);
    result.smtp = smtpCheck.valid;
    result.smtp_error = smtpCheck.error;

    if (smtpCheck.valid) {
      result.status = 'valid';
    } else {
      result.status = 'risky';
    }
  } else {
    // MX valid but SMTP skipped
    result.smtp = false;
    result.smtp_error = skipSmtp ? 'Skipped' : 'No MX hosts';
    result.status = 'valid'; // MX valid is a good sign
  }

  return result;
}

// ─── Batch Verify ─────────────────────────────────────────────────
export async function verifyBatch(
  emails: string[],
  options: {
    skipSmtp?: boolean;
    concurrency?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<VerifyResult[]> {
  const { skipSmtp = false, concurrency = 5, onProgress } = options;
  const results: VerifyResult[] = [];

  // Process in batches for concurrency control
  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((email) => verifyEmail(email, skipSmtp))
    );
    results.push(...batchResults);

    if (onProgress) {
      onProgress(Math.min(i + concurrency, emails.length), emails.length);
    }
  }

  return results;
}

// ─── Save verification results to contacts ────────────────────────
export function saveVerificationResults(results: VerifyResult[]): void {
  const db = getDb();
  const update = db.prepare(`
    UPDATE contacts SET
      verify_status = ?,
      verify_checked_at = ?
    WHERE email = ?
  `);

  const transaction = db.transaction(() => {
    for (const r of results) {
      update.run(r.status, r.checked_at, r.email);
    }
  });

  transaction();
}

// ─── Common disposable email domains ──────────────────────────────
export const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'temp-mail.org', 'fakeinbox.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'dispostable.com', 'trashmail.com',
  '10minutemail.com', 'maildrop.cc', 'discard.email', 'tempmail.net',
  'getnada.com', 'mohmal.com', 'emailondeck.com', '33mail.com',
  'mytemp.email', 'tempail.com', 'tempr.email', 'tempr.email',
  'discardmail.com', 'mailcatch.com', 'throwam.com', 'tmail.ws',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}
