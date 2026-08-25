import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { sendWebhookNotifications } from '@/lib/webhooks';

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

  const email = body.email || '';
  const name = body.full_name || body.name || body.first_name || '';
  const phone = body.phone || '';
  const address = body.address || '';
  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Valid email required' }, { status: 400 });
  }

  // Record submission
  db.prepare(`
    INSERT INTO landing_submissions (landing_page_id, form_data, email, name, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(page.id, JSON.stringify(body), email, name, req.headers.get('x-forwarded-for') || '', req.headers.get('user-agent') || '');

  // Update count
  db.prepare('UPDATE landing_pages SET submission_count = submission_count + 1 WHERE id = ?').run(page.id);

  // Add to target contact list if set
  if (page.target_list_id) {
    const contactId = uuidv4();
    try {
      db.prepare('INSERT OR IGNORE INTO contacts (id, email, name, phone, address) VALUES (?, ?, ?, ?, ?)').run(contactId, email, name, phone, address);
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

  return Response.json({ success: true, message: page.success_message });
}
