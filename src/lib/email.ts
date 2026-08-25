import nodemailer from 'nodemailer';
import { getDb } from './db';
import type { SmtpConfig, SmtpRateUsage } from './types';

// ─── Transporter Cache ──────────────────────────────────────────

const transporterCache = new Map<string, nodemailer.Transporter>();

export function createTransporter(config: SmtpConfig): nodemailer.Transporter {
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

export function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), value);
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
  private available: SmtpConfig[] = [];
  private currentIndex = 0;

  constructor(configs: SmtpConfig[]) {
    for (const c of configs) {
      if (!isSmtpRateLimited(c).limited) this.available.push(c);
    }
  }

  next(): SmtpConfig | null {
    if (this.available.length === 0) return null;
    return this.available[this.currentIndex++ % this.available.length];
  }

  recordSend(configId: string): void {
    getDb().prepare(
      `UPDATE smtp_config SET emails_sent = emails_sent + 1, last_used_at = datetime('now') WHERE id = ?`
    ).run(configId);
    recordSmtpSend(configId);
  }

  get availableCount(): number { return this.available.length; }
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
): { mailOptions: nodemailer.SendMailOptions; unsubscribeUrl?: string } {
  const fromAddress = `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`;
  const vars = { name: contactName, email: contactEmail };

  const renderedSubject = renderTemplate(subject, vars);
  let htmlBody = renderTemplate(templateBody, vars);

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

  const mailOptions: nodemailer.SendMailOptions = {
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
