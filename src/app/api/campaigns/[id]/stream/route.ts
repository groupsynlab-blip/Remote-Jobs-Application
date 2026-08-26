import { NextRequest } from 'next/server';
import { getDb, getSetting, isEmailUnsubscribed } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import {
  buildMailOptions,
  createTransporter,
  getEnabledSmtpConfigs,
  SmtpRotator,
  cleanupRateTracking,
  autoDisableOnLimit,
  reEnableExpiredLimits,
  hasHardBounced,
  isDomainThrottled,
  recordDomainSend,
  isRateLimitError,
  isBlacklisted,
  wasAlreadySent,
} from '@/lib/email';
import { isSchedulerPaused, pauseScheduler, resumeScheduler } from '@/lib/scheduler';

/**
 * GET /api/campaigns/[id]/stream — SSE endpoint for real-time per-email sending.
 */
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

  const smtpConfigs = getEnabledSmtpConfigs();
  if (smtpConfigs.length === 0) {
    return new Response(JSON.stringify({ error: 'No enabled SMTP configurations' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse subject rotation
  let subjects: string[] = [];
  if (campaign.subject_rotation) {
    try { subjects = JSON.parse(campaign.subject_rotation); } catch { subjects = []; }
  }
  if (subjects.length === 0) subjects = [campaign.template_subject];

  // Parse template rotation — load full template objects
  let templateRotation: { subject: string; body: string }[] = [];
  if (campaign.template_rotation) {
    try {
      const templateIds: string[] = JSON.parse(campaign.template_rotation);
      if (templateIds.length > 0) {
        const placeholders = templateIds.map(() => '?').join(',');
        const templates = db.prepare(
          `SELECT id, subject, body FROM email_templates WHERE id IN (${placeholders})`
        ).all(...templateIds) as { id: string; subject: string; body: string }[];
        templateRotation = templateIds
          .map(id => templates.find(t => t.id === id))
          .filter(Boolean) as { subject: string; body: string }[];
      }
    } catch { templateRotation = []; }
  }
  // If no template rotation, fall back to the single template
  if (templateRotation.length === 0) {
    templateRotation = [{ subject: campaign.template_subject, body: campaign.template_body }];
  }

  // Determine base URL
  let baseUrl = getSetting('app_url') || '';
  if (!baseUrl) {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    baseUrl = `${protocol}://${host}`;
  }
  baseUrl = baseUrl.replace(/\/$/, '');

  const mailCtx = {
    campaignId: id,
    baseUrl,
    replyTo: campaign.reply_to,
    enableTracking: campaign.enable_tracking === 1,
    enableUnsubscribe: campaign.enable_unsubscribe === 1,
  };

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, any>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; }
      };

      try {
        cleanupRateTracking();

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

        let rotator = new SmtpRotator(smtpConfigs);
        if (rotator.availableCount === 0) {
          send({ type: 'error', message: 'All SMTP servers are rate-limited' });
          controller.close();
          return;
        }

        let totalSent = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        let subjectRotationIndex = 0;
        const BATCH_SIZE = 50;
        let offset = 0;

        // Outer loop: fetch batches of queued emails from DB
        while (!closed) {
          // Check pause
          if (isSchedulerPaused()) {
            send({ type: 'paused', sent: totalSent, failed: totalFailed,
              remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total });
            break;
          }

          // Re-enable expired SMTP limits once per batch (not per email)
          const reenabled = reEnableExpiredLimits();
          if (reenabled.length > 0) {
            rotator = new SmtpRotator(getEnabledSmtpConfigs());
            send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
              remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
              email: '', status: 'info', message: `🔄 Re-enabled SMTP: ${reenabled.join(', ')}` });
          }

          const queuedEmails = db.prepare(`
            SELECT * FROM email_logs WHERE campaign_id = ? AND status = 'queued'
            ORDER BY created_at ASC LIMIT ? OFFSET ?
          `).all(id, BATCH_SIZE, offset) as any[];

          if (queuedEmails.length === 0) break;
          offset += queuedEmails.length;

          for (const emailLog of queuedEmails) {
            if (closed) break;

            if (isSchedulerPaused()) {
              send({ type: 'paused', sent: totalSent, failed: totalFailed,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total });
              closed = true;
              break;
            }

            const smtpConfig = rotator.next();
            if (!smtpConfig) {
              // Mark campaign as paused so scheduler can auto-resume it
              getDb().prepare("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'sending'").run(id);
              pauseScheduler();
              // Schedule auto-resume in 65 minutes (after hourly limit window resets)
              setTimeout(() => {
                const reenabled = reEnableExpiredLimits();
                if (reenabled.length > 0) {
                  resumeScheduler();
                  console.log('[Stream] Auto-resumed after rate limits expired: ' + reenabled.join(', '));
                }
              }, 65 * 60 * 1000);
              send({ type: 'paused', sent: totalSent, failed: totalFailed,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                message: 'All SMTP servers hit rate limits. Auto-resume scheduled in ~65 minutes.' });
              closed = true;
              break;
            }

            // Skip unsubscribed
            if (mailCtx.enableUnsubscribe && isEmailUnsubscribed(emailLog.contact_email)) {
              db.prepare("UPDATE email_logs SET status = 'failed', error_message = 'Recipient unsubscribed' WHERE id = ?").run(emailLog.id);
              totalSkipped++;
              send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                email: emailLog.contact_email, status: 'skipped', error: 'Unsubscribed' });
              continue;
            }

            // Skip hard bounces
            if (hasHardBounced(emailLog.contact_email)) {
              db.prepare("UPDATE email_logs SET status = 'bounced', error_message = 'Hard bounce recorded' WHERE id = ?").run(emailLog.id);
              totalSkipped++;
              send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                email: emailLog.contact_email, status: 'skipped', error: 'Hard bounce' });
              continue;
            }

            // Skip domain-throttled (max 50 emails/hour per domain)
            if (isDomainThrottled(emailLog.contact_email)) {
              db.prepare("UPDATE email_logs SET status = 'queued' WHERE id = ?").run(emailLog.id);
              totalSkipped++;
              send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                email: emailLog.contact_email, status: 'skipped', error: 'Domain throttled' });
              continue;
            }

            // Assign tracking ID
            let trackingId = emailLog.tracking_id;
            if (mailCtx.enableTracking && !trackingId) {
              trackingId = uuidv4();
              db.prepare('UPDATE email_logs SET tracking_id = ? WHERE id = ?').run(trackingId, emailLog.id);
            }

            // Rotate through templates (each has its own subject + body)
            const currentTemplate = templateRotation[subjectRotationIndex % templateRotation.length];
            subjectRotationIndex++;

            // If subject rotation is also enabled, override the template's subject
            let subjectTemplate = currentTemplate.subject;
            if (subjects.length > 1) {
              subjectTemplate = subjects[(subjectRotationIndex - 1) % subjects.length];
            }

            const { mailOptions } = buildMailOptions(
              mailCtx, smtpConfig, subjectTemplate, currentTemplate.body,
              emailLog.contact_name, emailLog.contact_email, trackingId,
            );

            try {
              const transporter = createTransporter(smtpConfig);
              await transporter.sendMail(mailOptions);

              db.prepare(
                "UPDATE email_logs SET status = 'sent', sent_at = datetime('now'), smtp_config_id = ?, subject_used = ? WHERE id = ?"
              ).run(smtpConfig.id, mailOptions.subject as string, emailLog.id);

              rotator.recordSend(smtpConfig.id);
              recordDomainSend(emailLog.contact_email);
              totalSent++;

              // Auto-disable if config just hit its limit
              const limitCheck = autoDisableOnLimit(smtpConfig);
              if (limitCheck.disabled) {
                // Rebuild rotator without this config
                rotator = new SmtpRotator(getEnabledSmtpConfigs());
              }

              send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                email: emailLog.contact_email, status: 'sent',
                subject: mailOptions.subject as string, server: smtpConfig.name || smtpConfig.host });
            } catch (error: any) {
              // Rate limit errors: keep email queued so it can be retried with another SMTP
              if (isRateLimitError(error)) {
                // Auto-disable this SMTP config so it's not used again this hour
                getDb().prepare("UPDATE smtp_config SET enabled = 0, updated_at = datetime('now') WHERE id = ?").run(smtpConfig.id);
                // Rebuild rotator without this config
                rotator = new SmtpRotator(getEnabledSmtpConfigs());
                
                send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
                  remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                  email: emailLog.contact_email, status: 'skipped',
                  error: 'Rate limited - will retry with another SMTP',
                  server: smtpConfig.name || smtpConfig.host });
                  
                // If no more SMTPs available, mark campaign as paused and schedule auto-resume
                if (rotator.availableCount === 0) {
                  getDb().prepare("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'sending'").run(id);
                  pauseScheduler();
                  // Schedule auto-resume in 65 minutes (after hourly limit window resets)
                  setTimeout(() => {
                    const reenabled = reEnableExpiredLimits();
                    if (reenabled.length > 0) {
                      resumeScheduler();
                      console.log('[Stream] Auto-resumed after rate limits expired: ' + reenabled.join(', '));
                    }
                  }, 65 * 60 * 1000);
                  send({ type: 'paused', sent: totalSent, failed: totalFailed,
                    remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                    message: 'All SMTP servers hit rate limits. Auto-resume scheduled in ~65 minutes.' });
                  closed = true;
                  break;
                }
                // Don't count as failed - email stays queued for retry
                continue;
              }
              
              // Other errors: mark as failed (permanent error)
              db.prepare(
                "UPDATE email_logs SET status = 'failed', error_message = ?, smtp_config_id = ? WHERE id = ?"
              ).run(error.message || 'Unknown error', smtpConfig.id, emailLog.id);
              totalFailed++;

              send({ type: 'progress', sent: totalSent, failed: totalFailed, skipped: totalSkipped,
                remaining: totalQueued.count - totalSent - totalFailed - totalSkipped, total,
                email: emailLog.contact_email, status: 'failed', error: error.message,
                server: smtpConfig.name || smtpConfig.host });
            }
          }
        }

        // Update campaign counters
        db.prepare('UPDATE campaigns SET sent_count = sent_count + ?, failed_count = failed_count + ? WHERE id = ?')
          .run(totalSent, totalFailed, id);

        // Check if all done
        const remaining = db.prepare(
          "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
        ).get(id) as { count: number };

        if (remaining.count === 0) {
          const finalCampaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any;
          if (finalCampaign?.failed_count >= finalCampaign?.total_count) {
            db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(id);
          } else if (!isSchedulerPaused()) {
            db.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").run(id);
          }
        }

        send({ type: 'done', sent: totalSent, failed: totalFailed, skipped: totalSkipped, total, remaining: remaining.count });
      } catch (error: any) {
        send({ type: 'error', message: error.message || 'Unknown error' });
      } finally {
        controller.close();
      }
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
