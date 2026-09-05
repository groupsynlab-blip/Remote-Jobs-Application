import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { getDb } from './db';
import type { SmtpConfig, SmtpRateUsage } from './types';

// ─── Transporter Cache ──────────────────────────────────────────

const transporterCache = new Map<string, Transporter>();

export function createTransporter(config: SmtpConfig): Transporter {
  const cacheKey = `${config.id}-${config.updated_at}`;
  const cached = transporterCache.get(cacheKey);
  if (cached) return cached;

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    auth: { user: config.user, pass: config.pass },
  });

  transporterCache.set(cacheKey, transport);
  return transport;
}

function clearTransporterCache(configId: string): void {
  for (const [key] of transporterCache) {
    if (key.startsWith(configId)) transporterCache.delete(key);
  }
}

// ─── Template Rendering ─────────────────────────────────────────

export function renderTemplate(template: string, variables: Record<string, string | undefined>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), value || '');
  }
  return rendered;
}

// ─── Rate Limiting ──────────────────────────────────────────────

export function getSmtpRateUsage(smtpConfigId: string): SmtpRateUsage {
  const db = getDb();
  const hourlyUsed = (db.prepare(
    `SELECT COUNT(*) as count FROM smtp_rate_tracking WHERE smtp_config_id = ? AND sent_at >= datetime('now', '-1 hour')`
  ).get(smtpConfigId) as { count: number }).count;
  const dailyUsed = (db.prepare(
    `SELECT COUNT(*) as count FROM smtp_rate_tracking WHERE smtp_config_id = ? AND sent_at >= datetime('now', '-1 day')`
  ).get(smtpConfigId) as { count: number }).count;
  return { hourly_used: hourlyUsed, daily_used: dailyUsed };
}

export function isSmtpRateLimited(config: SmtpConfig): { limited: boolean; reason?: string } {
  if (config.hourly_limit > 0) {
    const { hourly_used } = getSmtpRateUsage(config.id);
    if (hourly_used >= config.hourly_limit) {
      return { limited: true, reason: `Hourly limit reached (${hourly_used}/${config.hourly_limit})` };
    }
  }
  if (config.daily_limit > 0) {
    const { daily_used } = getSmtpRateUsage(config.id);
    if (daily_used >= config.daily_limit) {
      return { limited: true, reason: `Daily limit reached (${daily_used}/${config.daily_limit})` };
    }
  }
  return { limited: false };
}

/** Check if an error is a rate limit / throttling error from the SMTP server */

/** Check if an email or its domain is blacklisted */

/** Check if an email was already sent in a previous campaign */
export function wasAlreadySent(email: string, excludeCampaignId?: string): boolean {
  const db = getDb();
  let query = "SELECT id FROM email_logs WHERE contact_email = ? AND status = 'sent'";
  const params: string[] = [email.toLowerCase()];
  if (excludeCampaignId) {
    query += " AND campaign_id != ?";
    params.push(excludeCampaignId);
  }
  query += " LIMIT 1";
  const result = db.prepare(query).get(...params);
  return !!result;
}
export function isBlacklisted(email: string): boolean {
  const db = getDb();
  const domain = email.split('@')[1]?.toLowerCase();
  const emailLower = email.toLowerCase();
  const match = db.prepare(
    'SELECT id FROM email_blacklist WHERE email = ? OR domain = ? LIMIT 1'
  ).get(emailLower, domain);
  return !!match;
}
export function isRateLimitError(error: any): boolean {
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  // Gmail/Outlook rate limit responses
  if (msg.includes('421') || msg.includes('429') || msg.includes('550') ||
      msg.includes('rate') || msg.includes('throttl') ||
      msg.includes('too many') || msg.includes('limit exceeded') ||
      msg.includes('try again later') || msg.includes('sender rate') ||
      msg.includes('exceeded per hour') || msg.includes('daily user sending quota')) {
    return true;
  }
  // nodemailer error codes for rate limiting
  if (code === 'ethrottling' || code === 'emesg' || code === 'enotready') {
    return true;
  }
  return false;
}

/** Check if an SMTP config is near its hourly or daily limit (within threshold) */
export function isSmtpNearLimit(config: SmtpConfig, threshold: number = 2): { near: boolean; reason?: string } {
  if (config.hourly_limit > 0) {
    const { hourly_used } = getSmtpRateUsage(config.id);
    if (hourly_used >= config.hourly_limit - threshold) {
      return { near: true, reason: `Hourly: ${hourly_used}/${config.hourly_limit}` };
    }
  }
  if (config.daily_limit > 0) {
    const { daily_used } = getSmtpRateUsage(config.id);
    if (daily_used >= config.daily_limit - threshold) {
      return { near: true, reason: `Daily: ${daily_used}/${config.daily_limit}` };
    }
  }
  return { near: false };
}

export function recordSmtpSend(smtpConfigId: string): void {
  getDb().prepare(
    `INSERT INTO smtp_rate_tracking (smtp_config_id, sent_at) VALUES (?, datetime('now'))`
  ).run(smtpConfigId);
}

export function cleanupRateTracking(): void {
  getDb().prepare(`DELETE FROM smtp_rate_tracking WHERE sent_at < datetime('now', '-2 days')`).run();
}

/** Auto-disable a config if it just hit its rate limit. Returns whether it was disabled. */
export function autoDisableOnLimit(config: SmtpConfig): { disabled: boolean; reason?: string } {
  if (!config.enabled) return { disabled: false };
  const check = isSmtpRateLimited(config);
  if (check.limited && check.reason) {
    getDb().prepare("UPDATE smtp_config SET enabled = 0, updated_at = datetime('now') WHERE id = ?").run(config.id);
    clearTransporterCache(config.id);
    return { disabled: true, reason: check.reason };
  }
  return { disabled: false };
}

/** Re-enable SMTP configs whose rate limits have expired. Returns names of re-enabled configs. */
export function reEnableExpiredLimits(): string[] {
  const db = getDb();
  const disabled = db.prepare(
    "SELECT * FROM smtp_config WHERE enabled = 0 AND (daily_limit > 0 OR hourly_limit > 0)"
  ).all() as SmtpConfig[];

  const reenabled: string[] = [];
  for (const config of disabled) {
    const { hourly_used, daily_used } = getSmtpRateUsage(config.id);
    const hourlyOk = config.hourly_limit > 0 && hourly_used < config.hourly_limit;
    const dailyOk = config.daily_limit > 0 && daily_used < config.daily_limit;
    if (hourlyOk || dailyOk) {
      db.prepare("UPDATE smtp_config SET enabled = 1, updated_at = datetime('now') WHERE id = ?").run(config.id);
      reenabled.push(config.name || config.from_email);
    }
  }
  return reenabled;
}

export function getAllSmtpRateUsage(): Record<string, SmtpRateUsage> {
  const configs = getDb().prepare('SELECT id FROM smtp_config').all() as { id: string }[];
  const usage: Record<string, SmtpRateUsage> = {};
  for (const c of configs) usage[c.id] = getSmtpRateUsage(c.id);
  return usage;
}

// ─── SMTP Rotation ──────────────────────────────────────────────

export function getEnabledSmtpConfigs(): SmtpConfig[] {
  return getDb().prepare(
    `SELECT * FROM smtp_config WHERE enabled = 1 ORDER BY emails_sent ASC, created_at ASC`
  ).all() as SmtpConfig[];
}

export class SmtpRotator {
  private configs: SmtpConfig[] = [];
  private currentIndex = 0;
  private triedSinceLastSuccess = new Set<string>();

  constructor(configs: SmtpConfig[]) {
    this.configs = configs;
  }

  /**
   * Get the next SMTP config that is NOT rate-limited.
   * Re-checks limits per-call instead of filtering once at construction.
   * If all configs have been tried once and all are rate-limited, returns null.
   */
  next(): SmtpConfig | null {
    if (this.configs.length === 0) return null;

    const startIdx = this.currentIndex % this.configs.length;
    for (let i = 0; i < this.configs.length; i++) {
      const idx = (startIdx + i) % this.configs.length;
      const config = this.configs[idx];

      // Skip configs we already tried in this round (before a successful send)
      if (this.triedSinceLastSuccess.has(config.id)) continue;

      // Re-check rate limits in real-time from the DB
      const rateCheck = isSmtpRateLimited(config);
      if (rateCheck.limited) continue;

      // This config is available — advance index for next call
      this.currentIndex = idx + 1;
      return config;
    }

    // All configs tried and all rate-limited
    return null;
  }

  /**
   * Mark a successful send — clears the "tried" set so we can cycle again.
   */
  recordSend(configId: string): void {
    getDb().prepare(
      `UPDATE smtp_config SET emails_sent = emails_sent + 1, last_used_at = datetime('now') WHERE id = ?`
    ).run(configId);
    recordSmtpSend(configId);
    // Reset tried set on successful send — allows re-cycling
    this.triedSinceLastSuccess.clear();
  }

  /**
   * Mark a config as tried (rate-limited) for the current round.
   */
  markTried(configId: string): void {
    this.triedSinceLastSuccess.add(configId);
  }

  get availableCount(): number {
    let count = 0;
    for (const c of this.configs) {
      if (!isSmtpRateLimited(c).limited) count++;
    }
    return count;
  }
}

// ─── Click Tracking ─────────────────────────────────────────────

/**
 * Wrap all links in an HTML body with click tracking redirects.
 * Original: <a href="https://example.com">Click</a>
 * Tracked: <a href="https://app.com/api/track/click?id=xxx&url=https%3A%2F%2Fexample.com">Click</a>
 */
function wrapLinksWithTracking(html: string, trackingId: string, baseUrl: string): string {
  return html.replace(
    /<a\s+([^>]*?)href=["']?(https?:\/\/[^"'\s>]+)["']?([^>]*?)>/gi,
    (match, before, url, after) => {
      const encodedUrl = encodeURIComponent(url);
      const trackedUrl = `${baseUrl}/api/track/click?id=${trackingId}&url=${encodedUrl}`;
      return `<a ${before}href="${trackedUrl}"${after}>`;
    }
  );
}

/**
 * Check if an email has previously bounced (hard bounce)
 */
export function hasHardBounced(email: string): boolean {
  const db = getDb();
  const bounce = db.prepare(
    "SELECT id FROM email_bounces WHERE email = ? AND bounce_type = 'hard' LIMIT 1"
  ).get(email);
  return !!bounce;
}

/**
 * Check if an email is unsubscribed
 */
export function isUnsubscribed(email: string): boolean {
  const db = getDb();
  const unsub = db.prepare("SELECT id FROM unsubscribes WHERE email = ? LIMIT 1").get(email);
  return !!unsub;
}

/**
 * Check domain throttling — has this domain been emailed too much recently?
 */
export function isDomainThrottled(email: string, maxPerHour: number = 50): boolean {
  const db = getDb();
  const domain = email.split('@')[1];
  if (!domain) return false;
  const count = (db.prepare(
    "SELECT COUNT(*) as count FROM domain_throttling WHERE domain = ? AND sent_at >= datetime('now', '-1 hour')"
  ).get(domain) as { count: number }).count;
  return count >= maxPerHour;
}

/**
 * Record a send for domain throttling
 */
export function recordDomainSend(email: string): void {
  const db = getDb();
  const domain = email.split('@')[1];
  if (domain) {
    db.prepare("INSERT INTO domain_throttling (domain) VALUES (?)").run(domain);
  }
}

// ─── Shared Email Construction ──────────────────────────────────

export interface MailContext {
  campaignId: string;
  baseUrl: string;
  replyTo?: string | null;
  enableTracking: boolean;
  enableUnsubscribe: boolean;
}

/**
 * Build full mail options for a single email. Shared between stream and scheduler.
 * Handles: template rendering, footer injection, tracking pixel, unsubscribe headers.
 */
export function buildMailOptions(
  ctx: MailContext,
  smtpConfig: SmtpConfig,
  subject: string,
  templateBody: string,
  contactName: string,
  contactEmail: string,
  trackingId?: string | null,
): { mailOptions: SendMailOptions; unsubscribeUrl?: string } {
  const fromAddress = `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`;
  const vars = { name: contactName || 'there', email: contactEmail };

  const renderedSubject = renderTemplate(subject, vars);
  let htmlBody = renderTemplate(templateBody, vars);

  // If template is plain text (no HTML tags), convert to HTML
  if (!/<[a-z][\s\S]*>/i.test(htmlBody)) {
    htmlBody = htmlBody
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    htmlBody = `<div style="font-family: Verdana, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${htmlBody}</div>`;
  }

  // Wrap all links with click tracking
  if (ctx.enableTracking && trackingId) {
    htmlBody = wrapLinksWithTracking(htmlBody, trackingId, ctx.baseUrl);
  }

  let unsubscribeUrl: string | undefined;
  let footer = '';

  if (ctx.enableUnsubscribe) {
    unsubscribeUrl = `${ctx.baseUrl}/api/unsubscribe?email=${encodeURIComponent(contactEmail)}&campaign=${ctx.campaignId}`;
    footer += `\n<div style="text-align:center;padding:12px 0;font-size:11px;color:#999;font-family:sans-serif;">\n  If you don't want to receive these emails anymore, <a href="${unsubscribeUrl}" style="color:#6366f1;text-decoration:underline;">unsubscribe here</a>.\n</div>\n`;
  }

  if (ctx.enableTracking && trackingId) {
    footer += `\n<img src="${ctx.baseUrl}/api/track/open?id=${trackingId}" width="1" height="1" style="display:none" alt="" />\n`;
  }

  if (footer) {
    if (htmlBody.toLowerCase().includes('</body>')) {
      htmlBody = htmlBody.replace(/<\/body>/i, `${footer}</body>`);
    } else {
      htmlBody += footer;
    }
  }

  const mailOptions: SendMailOptions = {
    from: fromAddress,
    to: contactEmail,
    subject: renderedSubject,
    html: htmlBody,
  };

  if (ctx.replyTo) mailOptions.replyTo = ctx.replyTo;

  if (ctx.enableUnsubscribe && unsubscribeUrl) {
    mailOptions.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  return { mailOptions, unsubscribeUrl };
}
