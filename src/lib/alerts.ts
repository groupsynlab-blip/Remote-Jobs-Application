import { getDb, getSetting } from './db';
import nodemailer from 'nodemailer';

/**
 * Send an alert email when an SMTP config hits its limit or fails.
 * Uses the first enabled SMTP config to send the alert.
 */
export async function sendAlertEmail(subject: string, body: string): Promise<boolean> {
  try {
    const db = getDb();

    // Check if email alerts are enabled
    const alertsEnabled = getSetting('smtp_alerts_enabled');
    if (alertsEnabled === 'false') return false;

    const alertEmail = getSetting('smtp_alert_email');
    if (!alertEmail) return false;

    // Find an enabled SMTP config to send the alert
    const smtpConfig = db.prepare(
      'SELECT * FROM smtp_config WHERE enabled = 1 LIMIT 1'
    ).get() as any;

    if (!smtpConfig) return false;

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure === 1,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 20px;">
    <h1 style="margin: 0; font-size: 20px;">⚠️ Bulk Emailer Alert</h1>
  </div>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #1a1a2e;">${subject}</h2>
    <div style="color: #475569; font-size: 14px; line-height: 1.6;">
      ${body.replace(/\n/g, '<br>')}
    </div>
  </div>
  <div style="text-align: center; color: #94a3b8; font-size: 12px;">
    <p>This is an automated alert from Bulk Emailer</p>
    <p>${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"Bulk Emailer Alerts" <${smtpConfig.from_email}>`,
      to: alertEmail,
      subject: `⚠️ ${subject}`,
      html: htmlBody,
    });

    console.log(`[Alert] Sent alert email: ${subject}`);
    return true;
  } catch (error: any) {
    console.error(`[Alert] Failed to send alert email:`, error.message);
    return false;
  }
}

/**
 * Alert when an SMTP config hits its daily limit
 */
export async function alertDailyLimitHit(smtpName: string, smtpEmail: string, dailyUsed: number, dailyLimit: number): Promise<void> {
  const subject = `Daily Limit Reached — ${smtpName}`;
  const body = `SMTP Account: ${smtpName} (${smtpEmail})
Daily limit reached: ${dailyUsed}/${dailyLimit}

This account will be automatically paused until midnight Pacific Time when the daily limit resets.

Other active SMTP accounts will continue sending.`;

  await sendAlertEmail(subject, body);
}

/**
 * Alert when an SMTP config hits its hourly limit
 */
export async function alertHourlyLimitHit(smtpName: string, smtpEmail: string, hourlyUsed: number, hourlyLimit: number): Promise<void> {
  const subject = `Hourly Limit Reached — ${smtpName}`;
  const body = `SMTP Account: ${smtpName} (${smtpEmail})
Hourly limit reached: ${hourlyUsed}/${hourlyLimit}

This account will be paused for the current hour. It will automatically resume when the hourly window expires.`;

  await sendAlertEmail(subject, body);
}

/**
 * Alert when an SMTP connection fails
 */
export async function alertConnectionFailed(smtpName: string, smtpEmail: string, error: string): Promise<void> {
  const subject = `Connection Failed — ${smtpName}`;
  const body = `SMTP Account: ${smtpName} (${smtpEmail})
Connection error: ${error}

This account has been temporarily disabled. Please check your SMTP settings in the app.

Steps to fix:
1. Go to Settings → SMTP tab
2. Verify the password is correct
3. Ensure "Less secure app access" or App Password is configured
4. Re-enable the account`;

  await sendAlertEmail(subject, body);
}

/**
 * Alert when all SMTP accounts are exhausted
 */
export async function alertAllExhausted(totalPaused: number, totalEmailsRemaining: number): Promise<void> {
  const subject = `All SMTP Accounts Exhausted`;
  const body = `All ${totalPaused} SMTP accounts have hit their sending limits.

${totalEmailsRemaining} emails are queued and will be sent automatically when limits reset.

Daily limits reset at midnight Pacific Time (PDT/PST).
Hourly limits reset on a rolling 60-minute window.

No action needed — the system will auto-resume.`;

  await sendAlertEmail(subject, body);
}
