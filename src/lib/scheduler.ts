import { getDb } from './db';
import { v4 as uuidv4 } from 'uuid';
import {
  createTransporter,
  renderTemplate,
  getEnabledSmtpConfigs,
  SmtpRotator,
  cleanupRateTracking,
  reEnableExpiredLimits,
} from './email';
import { getSetting, isEmailUnsubscribed } from './db';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

// ─── Pause / Resume State ──────────────────────────────────────
let schedulerPaused = false;
let isOnline = true;

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000; // 2 seconds between batches
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

/**
 * Start the background scheduler.
 * Safe to call multiple times — only one scheduler runs at a time.
 */
export function startScheduler(): void {
  if (schedulerInterval) return; // Already running

  console.log('[Scheduler] Starting background scheduler (checking every 30s)');

  // Run immediately on start, then every 30 seconds
  checkAndSendScheduled();
  schedulerInterval = setInterval(checkAndSendScheduled, CHECK_INTERVAL_MS);
}

/** Stop the scheduler (for graceful shutdown) */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

/** Pause the scheduler — stops processing ALL campaigns */
export function pauseScheduler(): void {
  schedulerPaused = true;
  console.log('[Scheduler] ⏸ PAUSED — no new emails will be sent');
}

/** Resume the scheduler — resumes processing campaigns */
export function resumeScheduler(): void {
  schedulerPaused = false;
  console.log('[Scheduler] ▶ RESUMED — sending continues');
}

/** Check if scheduler is paused */
export function isSchedulerPaused(): boolean {
  return schedulerPaused;
}

/** Check if internet is available */
export function isInternetAvailable(): boolean {
  return isOnline;
}

/** Update internet connectivity status (called by API routes that detect connectivity issues) */
export function setInternetStatus(online: boolean): void {
  const wasOnline = isOnline;
  isOnline = online;

  if (!online && !schedulerPaused) {
    console.log('[Scheduler] 🌐 Internet lost — auto-pausing');
    schedulerPaused = true;
  } else if (online && schedulerPaused && wasOnline === false) {
    console.log('[Scheduler] 🌐 Internet restored — auto-resuming');
    schedulerPaused = false;
  }
}

// ─── Connectivity Monitor (Node.js) ────────────────────────────
// Periodic DNS check to detect internet loss
let connectivityInterval: ReturnType<typeof setInterval> | null = null;

function startConnectivityMonitor(): void {
  if (connectivityInterval) return;

  connectivityInterval = setInterval(async () => {
    try {
      // Try a lightweight fetch to detect connectivity
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch('https://dns.google/resolve?name=google.com', {
        signal: controller.signal,
      }).catch(() => {
        throw new Error('connectivity check failed');
      });

      clearTimeout(timeout);
      setInternetStatus(true);
    } catch {
      setInternetStatus(false);
    }
  }, 15_000); // Check every 15 seconds
}

function stopConnectivityMonitor(): void {
  if (connectivityInterval) {
    clearInterval(connectivityInterval);
    connectivityInterval = null;
  }
}

/** Get scheduler status */
export function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    isProcessing,
    paused: schedulerPaused,
    online: isOnline,
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
}

/** Main scheduler tick — find campaigns that are due and send them. */
async function checkAndSendScheduled(): Promise<void> {
  // Check pause and connectivity first
  if (schedulerPaused) {
    // Auto-resume if SMTP limits have expired
    const reenabled = reEnableExpiredLimits();
    if (reenabled.length > 0) {
      console.log('[Scheduler] Auto-resuming after SMTP limits expired: ' + reenabled.join(', '));
      schedulerPaused = false;
    } else {
      return; // Still paused
    }
  }

  if (isProcessing) {
    // Previous batch still running — skip this tick
    return;
  }

  isProcessing = true;

  try {
    const db = getDb();

    // Re-enable SMTP configs whose rate limits expired
    const reenabled = reEnableExpiredLimits();
    if (reenabled.length > 0) {
      console.log(`[Scheduler] 🔄 Re-enabled SMTP configs: ${reenabled.join(', ')}`);
      // Auto-resume any paused campaigns that have queued emails
      const pausedCampaigns = db.prepare(
        "SELECT id, name FROM campaigns WHERE status = 'paused'"
      ).all() as { id: string; name: string }[];
      for (const pc of pausedCampaigns) {
        const queued = db.prepare(
          "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
        ).get(pc.id) as { count: number };
        if (queued.count > 0) {
          console.log(`[Scheduler] Auto-resuming paused campaign: ${pc.name} (${queued.count} emails remaining)`);
          db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(pc.id);
          try {
            await processPausedCampaign(pc.id);
          } catch (err: any) {
            console.error(`[Scheduler] Error resuming campaign ${pc.name}:`, err.message);
          }
        } else {
          db.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").run(pc.id);
        }
      }
    }

    // Clean up old rate tracking rows periodically
    cleanupRateTracking();

    // Find campaigns where scheduled_at has passed and status is 'scheduled'
    const dueCampaigns = db.prepare(`
      SELECT id, name FROM campaigns
      WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= datetime('now')
      ORDER BY scheduled_at ASC
      LIMIT 5
    `).all() as { id: string; name: string }[];

    if (dueCampaigns.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`[Scheduler] Found ${dueCampaigns.length} campaign(s) due for sending`);

    for (const campaign of dueCampaigns) {
      // Check pause between campaigns
      if (schedulerPaused) {
        console.log('[Scheduler] Paused during processing — stopping');
        break;
      }

      try {
        await processScheduledCampaign(campaign.id);
        console.log(`[Scheduler] Campaign "${campaign.name}" (${campaign.id.slice(0, 8)}...) processed successfully`);
      } catch (error: any) {
        console.error(`[Scheduler] Error processing campaign "${campaign.name}":`, error.message);
        // Mark as failed so it doesn't retry forever
        const db = getDb();
        db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaign.id);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] Error in scheduler tick:', error.message);
  } finally {
    isProcessing = false;
  }
}

/** Process a single scheduled campaign: queue contacts, then send in batches. */
async function processScheduledCampaign(campaignId: string): Promise<void> {
  const db = getDb();

  // Get campaign details
  const campaign = db.prepare(`
    SELECT c.*, t.subject as template_subject, t.body as template_body
    FROM campaigns c
    LEFT JOIN email_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(campaignId) as any;

  if (!campaign || campaign.status !== 'scheduled') {
    return; // Already processed or doesn't exist
  }

  // Check that SMTP configs are available
  const smtpConfigs = getEnabledSmtpConfigs();
  if (smtpConfigs.length === 0) {
    console.error('[Scheduler] No enabled SMTP configs — cannot send');
    db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaignId);
    return;
  }

  // Queue all contacts as email_logs (same as PATCH action='send')
  const members = db.prepare(`
    SELECT c.id, c.email, c.name
    FROM contacts c
    INNER JOIN contact_list_members clm ON c.id = clm.contact_id
    WHERE clm.contact_list_id = ?
  `).all(campaign.contact_list_id) as { id: string; email: string; name: string }[];

  if (members.length === 0) {
    console.error('[Scheduler] No contacts in list — marking as sent (empty)');
    db.prepare("UPDATE campaigns SET status = 'sent', total_count = 0 WHERE id = ?").run(campaignId);
    return;
  }

  // Insert queued email logs in a transaction
  const insertLog = db.prepare(`
    INSERT INTO email_logs (id, campaign_id, contact_id, contact_email, contact_name, status)
    VALUES (?, ?, ?, ?, ?, 'queued')
  `);

  const createLogs = db.transaction(() => {
    for (const member of members) {
      insertLog.run(uuidv4(), campaignId, member.id, member.email, member.name);
    }
  });
  createLogs();

  // Mark as sending
  db.prepare(`
    UPDATE campaigns SET status = 'sending', total_count = ?, sent_at = datetime('now') WHERE id = ?
  `).run(members.length, campaignId);

  console.log(`[Scheduler] Queued ${members.length} emails for "${campaign.name}" — sending in batches of ${BATCH_SIZE}`);

  // Now send in batches with delays between them
  let allDone = false;

  while (!allDone) {
    // ═══ PAUSE CHECK ═══
    if (schedulerPaused) {
      console.log(`[Scheduler] Paused — campaign "${campaign.name}" stopped with remaining emails`);
      return; // Exit — emails remain queued in DB for resume
    }

    const batchResult = await sendBatch(campaignId, campaign);

    if (batchResult.done) {
      allDone = true;
      console.log(`[Scheduler] Campaign "${campaign.name}" — all emails sent!`);
    } else if (batchResult.sent === 0 && batchResult.skipped > 0) {
      // All rate-limited — wait and try again (up to 3 retries)
      console.log(`[Scheduler] Campaign "${campaign.name}" — all SMTP servers rate-limited, waiting 60s...`);
      await sleep(60_000);
    } else {
      // Wait between batches
      console.log(`[Scheduler] Campaign "${campaign.name}" — sent ${batchResult.sent}, ${batchResult.remaining} remaining`);
      await sleep(BATCH_DELAY_MS);
    }
  }
}

/**
 * Send a single batch of queued emails for a campaign.
 * Returns batch stats.
 */
async function sendBatch(
  campaignId: string,
  campaign: any
): Promise<{ sent: number; failed: number; skipped: number; remaining: number; done: boolean }> {
  const db = getDb();

  // Parse subject rotation
  let subjects: string[] = [];
  if (campaign.subject_rotation) {
    try { subjects = JSON.parse(campaign.subject_rotation); } catch { subjects = []; }
  }
  if (subjects.length === 0) {
    subjects = [campaign.template_subject];
  }

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
  if (templateRotation.length === 0) {
    templateRotation = [{ subject: campaign.template_subject, body: campaign.template_body }];
  }

  const replyTo = campaign.reply_to || null;
  const enableTracking = campaign.enable_tracking === 1;
  const enableUnsubscribe = campaign.enable_unsubscribe === 1;

  // Get SMTP configs
  const smtpConfigs = getEnabledSmtpConfigs();
  if (smtpConfigs.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, remaining: 0, done: false };
  }

  const rotator = new SmtpRotator(smtpConfigs);

  if (rotator.availableCount === 0) {
    return { sent: 0, failed: 0, skipped: 0, remaining: 0, done: false };
  }

  // Get next batch of queued emails
  const queuedEmails = db.prepare(`
    SELECT * FROM email_logs
    WHERE campaign_id = ? AND status = 'queued'
    ORDER BY created_at ASC
    LIMIT ?
  `).all(campaignId, BATCH_SIZE) as any[];

  if (queuedEmails.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, remaining: 0, done: true };
  }

  // Determine base URL
  let baseUrl = getSetting('app_url') || 'http://localhost:3000';
  baseUrl = baseUrl.replace(/\/$/, '');

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let subjectIndex = campaign.sent_count || 0;

  for (const emailLog of queuedEmails) {
    // ═══ PAUSE CHECK per email ═══
    if (schedulerPaused) {
      break;
    }

    const smtpConfig = rotator.next();
    if (!smtpConfig) {
      skippedCount++;
      continue;
    }

    // Skip unsubscribed
    if (enableUnsubscribe && isEmailUnsubscribed(emailLog.contact_email)) {
      db.prepare("UPDATE email_logs SET status = 'skipped', error_message = 'Recipient unsubscribed' WHERE id = ?").run(emailLog.id);
      skippedCount++;
      continue;
    }

    let trackingId = emailLog.tracking_id;
    if (enableTracking && !trackingId) {
      trackingId = uuidv4();
      db.prepare('UPDATE email_logs SET tracking_id = ? WHERE id = ?').run(trackingId, emailLog.id);
    }

    const transporter = createTransporter(smtpConfig);
    const fromAddress = `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`;
    // Rotate through templates
    const currentTemplate = templateRotation[subjectIndex % templateRotation.length];
    subjectIndex++;

    // If subject rotation is also enabled, override the template's subject
    let subjectTemplate = currentTemplate.subject;
    if (subjects.length > 1) {
      subjectTemplate = subjects[(subjectIndex - 1) % subjects.length];
    }

    try {
      const subject = renderTemplate(subjectTemplate, {
        name: emailLog.contact_name,
        email: emailLog.contact_email,
      });
      let htmlBody = renderTemplate(currentTemplate.body, {
        name: emailLog.contact_name,
        email: emailLog.contact_email,
      });

      // Build footer
      let footer = '';

      if (enableUnsubscribe) {
        const unsubUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(emailLog.contact_email)}&campaign=${campaignId}`;
        footer += `\n<div style="text-align:center;padding:12px 0;font-size:11px;color:#999;font-family:sans-serif;">\n  If you don't want to receive these emails anymore, <a href="${unsubUrl}" style="color:#6366f1;text-decoration:underline;">unsubscribe here</a>.\n</div>\n`;
      }

      if (enableTracking && trackingId) {
        footer += `\n<img src="${baseUrl}/api/track/open?id=${trackingId}" width="1" height="1" style="display:none" alt="" />\n`;
      }

      if (footer) {
        if (htmlBody.toLowerCase().includes('</body>')) {
          htmlBody = htmlBody.replace(/<\/body>/i, `${footer}</body>`);
        } else {
          htmlBody += footer;
        }
      }

      const mailOptions: any = {
        from: fromAddress,
        to: emailLog.contact_email,
        subject,
        html: htmlBody,
      };

      if (replyTo) mailOptions.replyTo = replyTo;

      if (enableUnsubscribe) {
        const unsubUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(emailLog.contact_email)}&campaign=${campaignId}`;
        mailOptions.headers = {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        };
      }

      await transporter.sendMail(mailOptions);

      db.prepare(
        "UPDATE email_logs SET status = 'sent', sent_at = datetime('now'), smtp_config_id = ?, subject_used = ? WHERE id = ?"
      ).run(smtpConfig.id, subject, emailLog.id);

      rotator.recordSend(smtpConfig.id);
      sentCount++;
    } catch (error: any) {
      db.prepare(
        "UPDATE email_logs SET status = 'skipped', error_message = ?, smtp_config_id = ? WHERE id = ?"
      ).run(error.message || 'Unknown error', smtpConfig.id, emailLog.id);
      skippedCount++;
    }

    // Yield to event loop every email so sending/scraping/verification are not blocked
    await new Promise(resolve => setImmediate(resolve));
  }

  // Update campaign counters
  db.prepare(`
    UPDATE campaigns SET
      sent_count = sent_count + ?,
      failed_count = failed_count + ?,
      skipped_count = COALESCE(skipped_count, 0) + ?
    WHERE id = ?
  `).run(sentCount, failedCount, skippedCount, campaignId);

  // Check if all done
  const remaining = db.prepare(
    "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
  ).get(campaignId) as { count: number };

  if (remaining.count === 0) {
    const finalCampaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;
    if (finalCampaign && finalCampaign.sent_count === 0 && finalCampaign.failed_count >= finalCampaign.total_count) {
      db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaignId);
    } else {
      db.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").run(campaignId);
    }
  }

  return {
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
    remaining: remaining.count,
    done: remaining.count === 0,
  };
}

/**
 * Process a paused campaign — send remaining queued emails.
 * Called when SMTP limits expire and scheduler auto-resumes.
 */
async function processPausedCampaign(campaignId: string): Promise<void> {
  const db = getDb();
  const campaign = db.prepare(`
    SELECT c.*, t.subject as template_subject, t.body as template_body
    FROM campaigns c LEFT JOIN email_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(campaignId) as any;

  if (!campaign || campaign.status !== 'sending') return;

  console.log(`[Scheduler] Resuming campaign "${campaign.name}" — sending remaining emails`);

  let allDone = false;
  while (!allDone) {
    if (schedulerPaused) {
      db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'sending'").run(campaignId);
      return;
    }
    const batchResult = await sendBatch(campaignId, campaign);
    if (batchResult.done) {
      allDone = true;
      console.log(`[Scheduler] Campaign "${campaign.name}" — all emails sent!`);
    } else if (batchResult.sent === 0 && batchResult.skipped > 0) {
      db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'sending'").run(campaignId);
      return;
    } else {
      await sleep(BATCH_DELAY_MS);
    }
  }
  const remaining = db.prepare(
    "SELECT COUNT(*) as count FROM email_logs WHERE campaign_id = ? AND status = 'queued'"
  ).get(campaignId) as { count: number };
  if (remaining.count === 0) {
    db.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").run(campaignId);
  }
}


/** Auto-ramp warmup configs — increase daily limit by 2 every 3 days */
function autoRampWarmup(): void {
  const db = getDb();
  const activeWarmups = db.prepare(
    "SELECT * FROM warmup_configs WHERE status = 'active'"
  ).all() as any[];
  
  for (const w of activeWarmups) {
    if (w.current_day > 0 && w.current_day % 3 === 0 && w.daily_limit < 100) {
      const newLimit = Math.min(w.daily_limit + 2, 100);
      if (newLimit !== w.daily_limit) {
        db.prepare("UPDATE warmup_configs SET daily_limit = ? WHERE id = ?").run(newLimit, w.id);
        console.log(`[Scheduler] Warmup auto-ramp: ${w.id.slice(0,8)} daily_limit ${w.daily_limit} -> ${newLimit}`);
      }
    }
  }
}
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
