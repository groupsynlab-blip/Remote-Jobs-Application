import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { sendWebhookNotifications } from '@/lib/webhooks';
import { createTransporter, getEnabledSmtpConfigs } from '@/lib/email';

// ─── Submission abuse guard ─────────────────────────────────────
// DB-backed per-IP limiter: max 5 submissions per IP per hour, and
// basic email sanity. Prevents bots from flooding the contact list
// and burning SMTP quota on forward emails.
const MAX_SUBMISSIONS_PER_HOUR = 5;

function tooManySubmissions(ip: string): boolean {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS form_rate_limit (
      ip TEXT NOT NULL,
      window_start TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ip, window_start)
    )`);
    const window = new Date().toISOString().slice(0, 13); // hourly bucket
    const row = db.prepare('SELECT count FROM form_rate_limit WHERE ip = ? AND window_start = ?').get(ip, window) as { count: number } | undefined;
    return (row?.count || 0) >= MAX_SUBMISSIONS_PER_HOUR;
  } catch {
    return false; // never block submissions due to limiter failure
  }
}

function recordSubmission(ip: string): void {
  try {
    const db = getDb();
    const window = new Date().toISOString().slice(0, 13);
    db.prepare(`
      INSERT INTO form_rate_limit (ip, window_start, count) VALUES (?, ?, 1)
      ON CONFLICT (ip, window_start) DO UPDATE SET count = count + 1
    `).run(ip, window);
    // Occasionally prune old buckets
    if (Math.random() < 0.05) {
      db.prepare('DELETE FROM form_rate_limit WHERE window_start < ?').run(
        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 13)
      );
    }
  } catch {}
}

/** GET /api/landing-pages/public/[slug] — get landing page data for rendering */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const page = db.prepare('SELECT * FROM landing_pages WHERE slug = ? AND enabled = 1').get(slug) as any;
  if (!page) return Response.json({ error: 'Not found' }, { status: 404 });

  // Increment view count
  db.prepare('UPDATE landing_pages SET view_count = view_count + 1 WHERE id = ?').run(page.id);

  return Response.json(page);
}

/** POST /api/landing-pages/public/[slug] — submit form */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();
  const db = getDb();

  const page = db.prepare('SELECT * FROM landing_pages WHERE slug = ? AND enabled = 1').get(slug) as any;
  if (!page) return Response.json({ error: 'Not found' }, { status: 404 });

  const email = String(body.email || '').trim().slice(0, 254);
  const name = String(body.name || '').trim().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.json({ error: 'Valid email required' }, { status: 400 });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (tooManySubmissions(ip)) {
    return Response.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
  }

  // Record submission
  db.prepare(`
    INSERT INTO landing_submissions (landing_page_id, form_data, email, name, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(page.id, JSON.stringify(body).slice(0, 10000), email, name, ip, (req.headers.get('user-agent') || '').slice(0, 500));
  recordSubmission(ip);

  // Update count
  db.prepare('UPDATE landing_pages SET submission_count = submission_count + 1 WHERE id = ?').run(page.id);

  // Add to target contact list if set
  if (page.target_list_id) {
    const contactId = uuidv4();
    try {
      db.prepare('INSERT OR IGNORE INTO contacts (id, email, name) VALUES (?, ?, ?)').run(contactId, email, name);
      const contact = db.prepare('SELECT id FROM contacts WHERE email = ?').get(email) as { id: string };
      if (contact) {
        db.prepare('INSERT OR IGNORE INTO contact_list_members (contact_list_id, contact_id) VALUES (?, ?)')
          .run(page.target_list_id, contact.id);
      }
    } catch {
      // Duplicate contact — that's fine
    }
  }

  // Send webhook notifications (fire and forget — don't block the response)
  sendWebhookNotifications({
    event: 'landing_page_submission',
    landing_page: { id: page.id, name: page.name, slug: page.slug },
    submission: {
      email,
      name,
      form_data: body,
      submitted_at: new Date().toISOString(),
    },
  }).catch(() => {}); // Errors logged internally

  // Direct email forwarding (works even without webhooks being enabled)
  forwardSubmissionEmail(page, body, email, name).catch(() => {});

  return Response.json({ success: true, message: page.success_message });
}

/**
 * Forward landing page submission via email directly.
 * Uses SMTP if configured, otherwise falls back to logging.
 */
async function forwardSubmissionEmail(page: any, body: any, email: string, name: string): Promise<void> {
  try {
    const db = getDb();

    // Get email forwarding recipient from settings
    const recipientRow = db.prepare("SELECT value FROM settings WHERE key = 'webhook_email_recipient'").get() as any;
    const recipient = recipientRow?.value;
    if (!recipient) return; // No email configured

    // Get SMTP config
    const { createTransporter, getEnabledSmtpConfigs } = await import('@/lib/email');
    const configs = getEnabledSmtpConfigs();
    if (configs.length === 0) return; // No SMTP configured

    const transporter = createTransporter(configs[0]);

    // Build form fields HTML
    const fields = Object.entries(body)
      .filter(([key]) => key !== 'email' && key !== 'name')
      .map(([key, value]) => `<tr><td style="padding:8px 12px;font-weight:600;color:#475569;text-transform:capitalize;">${key.replace(/_/g, ' ')}</td><td style="padding:8px 12px;">${value}</td></tr>`)
      .join('');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:2rem;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:1.5rem;border-radius:0.75rem 0.75rem 0 0;text-align:center;">
          <h2 style="margin:0;font-size:1.2rem;">📩 New Landing Page Submission</h2>
          <p style="margin:0.5rem 0 0;opacity:0.9;font-size:0.85rem;">${page.name}</p>
        </div>
        <div style="background:#f8fafc;padding:1.5rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0.75rem 0.75rem;">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <tr style="background:#e2e8f0;">
              <td style="padding:8px 12px;font-weight:600;">Email</td>
              <td style="padding:8px 12px;">${email}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-weight:600;">Name</td>
              <td style="padding:8px 12px;">${name || 'Not provided'}</td>
            </tr>
            ${fields}
          </table>
          <p style="color:#94a3b8;font-size:0.75rem;margin:1rem 0 0;text-align:center;">
            Submitted at ${new Date().toISOString()}
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${page.name}" <${configs[0].from_email || configs[0].user}>`,
      to: recipient,
      subject: `📩 New Submission: ${page.name} — ${name || email}`,
      html,
    });

    console.log(`[Landing Page] Email forwarded to ${recipient}`);
  } catch (err: any) {
    console.error(`[Landing Page] Email forwarding failed:`, err.message);
  }
}
