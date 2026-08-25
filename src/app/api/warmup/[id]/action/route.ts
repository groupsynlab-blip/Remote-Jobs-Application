import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { createTransporter, renderTemplate, recordSmtpSend } from '@/lib/email';
import { v4 as uuidv4 } from 'uuid';

/** POST /api/warmup/[id]/action — start, stop, send-now */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { action } = body;
  const db = getDb();

  const warmup = db.prepare(`
    SELECT w.*, sc.name as smtp_name, sc.from_email, sc.host, sc.id as config_id, sc.*
    FROM warmup_configs w
    JOIN smtp_config sc ON w.smtp_config_id = sc.id
    WHERE w.id = ?
  `).get(id) as any;

  if (!warmup) return Response.json({ error: 'Not found' }, { status: 404 });

  if (action === 'start') {
    db.prepare("UPDATE warmup_configs SET status = 'active', started_at = datetime('now') WHERE id = ?").run(id);
    return Response.json({ ok: true, status: 'active' });
  }

  if (action === 'stop') {
    db.prepare("UPDATE warmup_configs SET status = 'paused' WHERE id = ?").run(id);
    return Response.json({ ok: true, status: 'paused' });
  }

  if (action === 'send-now') {
    // Send warmup emails immediately
    const smtpConfig = db.prepare('SELECT * FROM smtp_config WHERE id = ?').get(warmup.smtp_config_id) as any;
    if (!smtpConfig) return Response.json({ error: 'SMTP config not found' }, { status: 404 });

    // Generate warmup recipients (your own addresses + catch-all)
    const warmupRecipients = generateWarmupRecipients(smtpConfig.from_email);
    const toSend = Math.min(warmup.daily_limit - warmup.today_sent, warmupRecipients.length, 10);
    
    if (toSend <= 0) {
      return Response.json({ error: 'Daily limit reached or no recipients available' }, { status: 400 });
    }

    const transporter = createTransporter(smtpConfig);
    let sent = 0;
    let failed = 0;

    const subjects = [
      'Checking in — quick update',
      'Hello from your inbox',
      'Welcome aboard!',
      'Quick question for you',
      'Following up on our conversation',
      'Monthly newsletter update',
      'Important: Account verification',
      'Your weekly digest',
      'New features available',
      'Thank you for subscribing',
    ];

    const bodies = [
      '<p>Hi {{name}},<br><br>Just a quick check-in to make sure everything is working well. We\'re excited to have you on board!</p><p>Best regards,<br>The Team</p>',
      '<p>Hello {{name}},<br><br>We wanted to share some exciting updates with you this month. Stay tuned for more great content.</p><p>Cheers!</p>',
      '<p>Hi {{name}},<br><br>This is a friendly reminder about your account. Everything looks good on our end!</p><p>Warm regards</p>',
    ];

    for (let i = 0; i < toSend; i++) {
      const recipient = warmupRecipients[i % warmupRecipients.length];
      const subject = subjects[Math.floor(Math.random() * subjects.length)];
      const body = bodies[Math.floor(Math.random() * bodies.length)];
      const trackingId = uuidv4();

      try {
        await transporter.sendMail({
          from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
          to: recipient,
          subject,
          html: renderTemplate(body, { name: smtpConfig.from_name || 'User', email: recipient }),
        });

        db.prepare(`
          INSERT INTO warmup_logs (warmup_id, smtp_config_id, recipient_email, subject, status, sent_at)
          VALUES (?, ?, ?, ?, 'sent', datetime('now'))
        `).run(id, smtpConfig.id, recipient, subject);

        recordSmtpSend(smtpConfig.id);
        sent++;
      } catch (error: any) {
        db.prepare(`
          INSERT INTO warmup_logs (warmup_id, smtp_config_id, recipient_email, subject, status, error_message, sent_at)
          VALUES (?, ?, ?, ?, 'failed', ?, datetime('now'))
        `).run(id, smtpConfig.id, recipient, subject, error.message);
        failed++;
      }
    }

    // Update counts
    db.prepare('UPDATE warmup_configs SET emails_sent = emails_sent + ? WHERE id = ?').run(sent, id);
    db.prepare('UPDATE smtp_config SET emails_sent = emails_sent + ? WHERE id = ?').run(sent, smtpConfig.id);

    return Response.json({ ok: true, sent, failed, remaining: warmup.daily_limit - warmup.today_sent - sent });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

function generateWarmupRecipients(fromEmail: string): string[] {
  // Generate safe warmup recipients — the sender's own addresses and variations
  const domain = fromEmail.split('@')[1];
  const local = fromEmail.split('@')[0];
  return [
    fromEmail, // Send to yourself
    `${local}+test1@${domain}`,
    `${local}+test2@${domain}`,
    `${local}+test3@${domain}`,
    `${local}+test4@${domain}`,
    `${local}+test5@${domain}`,
    `${local}+news@${domain}`,
    `${local}+updates@${domain}`,
    `${local}+hello@${domain}`,
    `${local}+inbox@${domain}`,
  ];
}
