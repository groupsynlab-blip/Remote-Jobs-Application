import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const campaign = db.prepare(`
    SELECT c.*, t.subject as template_subject, t.body as template_body
    FROM campaigns c LEFT JOIN email_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(id) as any;

  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  let smtpConfigs: any[] = [];
  try {
    const { getEnabledSmtpConfigs } = await import('@/lib/email');
    smtpConfigs = getEnabledSmtpConfigs();
    if (campaign.selected_smtp_ids) {
      try {
        const selectedIds: string[] = JSON.parse(campaign.selected_smtp_ids);
        if (selectedIds.length > 0) {
          smtpConfigs = smtpConfigs.filter((c) => selectedIds.includes(c.id));
        }
      } catch {}
    }
  } catch (e: any) {
    console.error('[Stream] Failed to load SMTP configs:', e.message);
  }

  if (smtpConfigs.length === 0) {
    return new Response(JSON.stringify({ error: 'No enabled SMTP configurations' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      try {
        const totalQueued = db.prepare(
          "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
        ).get(id) as { count: number };

        const previouslySent = db.prepare(
          "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'sent'"
        ).get(id) as { count: number };

        const previouslyFailed = db.prepare(
          "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'failed'"
        ).get(id) as { count: number };

        const total = campaign.total_count || (totalQueued.count + previouslySent.count + previouslyFailed.count);

        send({
          type: 'start', total, remaining: totalQueued.count,
          previously_sent: previouslySent.count, previously_failed: previouslyFailed.count,
          campaign_name: campaign.name,
        });

        if (totalQueued.count === 0) {
          send({ type: 'done', sent: 0, failed: 0, skipped: 0, total });
          controller.close();
          return;
        }

        // Simple round-robin sending
        let smtpIndex = 0;
        let totalSent = 0;
        let totalFailed = 0;
        const delayMs = (campaign.delay_seconds || 2) * 1000;

        while (!closed) {
          const queuedEmails = db.prepare(
            "SELECT * FROM email_logs WHERE campaign_id = ? AND status = 'queued' ORDER BY created_at ASC LIMIT 10"
          ).all(id) as any[];

          if (queuedEmails.length === 0) break;

          for (const emailLog of queuedEmails) {
            if (closed) break;

            const smtpConfig = smtpConfigs[smtpIndex % smtpConfigs.length];
            smtpIndex++;

            try {
              const { createTransporter, buildMailOptions } = await import('@/lib/email');
              const transporter = createTransporter(smtpConfig);
              const trackingId = uuidv4();
              const { mailOptions } = buildMailOptions(
                {
                  campaignId: id,
                  baseUrl: '',
                  replyTo: campaign.reply_to,
                  enableTracking: campaign.enable_tracking === 1,
                  enableUnsubscribe: campaign.enable_unsubscribe === 1,
                },
                smtpConfig,
                campaign.template_subject,
                campaign.template_body,
                emailLog.contact_name || '',
                emailLog.contact_email,
                trackingId
              );
              await transporter.sendMail(mailOptions);
              db.prepare("UPDATE email_logs SET status = 'sent', sent_at = datetime('now'), smtp_config_id = ?, tracking_id = ? WHERE id = ?")
                .run(smtpConfig.id, trackingId, emailLog.id);
              totalSent++;
              send({ type: 'progress', sent: totalSent, failed: totalFailed, remaining: totalQueued.count - totalSent - totalFailed, total, email: emailLog.contact_email, status: 'sent', server: smtpConfig.name });
            } catch (error: any) {
              db.prepare("UPDATE email_logs SET status = 'failed', error_message = ?, smtp_config_id = ? WHERE id = ?")
                .run(error.message, smtpConfig.id, emailLog.id);
              totalFailed++;
              send({ type: 'progress', sent: totalSent, failed: totalFailed, remaining: totalQueued.count - totalSent - totalFailed, total, email: emailLog.contact_email, status: 'failed', error: error.message });
            }

            if (!closed && delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
        }

        db.prepare('UPDATE campaigns SET sent_count = sent_count + ?, failed_count = failed_count + ? WHERE id = ?')
          .run(totalSent, totalFailed, id);

        const remaining = db.prepare(
          "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
        ).get(id) as { count: number };

        if (remaining.count === 0) {
          db.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").run(id);
        }

        send({ type: 'done', sent: totalSent, failed: totalFailed, skipped: 0, total, remaining: remaining.count });
      } catch (error: any) {
        console.error('[Stream] Error:', error.message);
        send({ type: 'error', message: error.message || 'Unknown error' });
      }
      controller.close();
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
