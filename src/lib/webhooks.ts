import { getDb } from './db';

interface WebhookPayload {
  event: string;
  landing_page: {
    id: string;
    name: string;
    slug: string;
  };
  submission: {
    email: string;
    name: string;
    form_data: Record<string, string>;
    submitted_at: string;
  };
}

/**
 * Get configured webhook settings from DB
 */
export function getWebhookSettings(): {
  slack_url: string;
  discord_url: string;
  email_recipient: string;
  enabled: boolean;
} {
  const db = getDb();
  const get = (key: string) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || '';
  };

  return {
    slack_url: get('webhook_slack_url'),
    discord_url: get('webhook_discord_url'),
    email_recipient: get('webhook_email_recipient'),
    enabled: get('webhook_enabled') === 'true',
  };
}

/**
 * Send webhook notifications for a landing page submission
 */
export async function sendWebhookNotifications(payload: WebhookPayload): Promise<void> {
  const settings = getWebhookSettings();
  if (!settings.enabled) return;

  const promises: Promise<void>[] = [];

  // Slack webhook
  if (settings.slack_url) {
    promises.push(sendSlackWebhook(settings.slack_url, payload));
  }

  // Discord webhook
  if (settings.discord_url) {
    promises.push(sendDiscordWebhook(settings.discord_url, payload));
  }

  // Email notification
  if (settings.email_recipient) {
    promises.push(sendEmailNotification(settings.email_recipient, payload));
  }

  // Fire all webhooks in parallel, don't block
  Promise.allSettled(promises).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[Webhook] Notification failed:`, r.reason);
      }
    });
  });
}

/**
 * Send Slack incoming webhook
 */
async function sendSlackWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const fields = Object.entries(payload.submission.form_data)
    .map(([key, value]) => `*${key}:* ${value}`)
    .join('\n');

  const slackPayload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📩 New Landing Page Submission',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Page:*\n${payload.landing_page.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${payload.submission.email}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Submission Details:*\n${fields || '_No additional fields_'}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Received at ${payload.submission.submitted_at}`,
          },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackPayload),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status}`);
  }
}

/**
 * Send Discord webhook
 */
async function sendDiscordWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const fields = Object.entries(payload.submission.form_data)
    .map(([key, value]) => `**${key}:** ${value}`)
    .join('\n');

  const discordPayload = {
    embeds: [
      {
        title: '📩 New Landing Page Submission',
        color: 0x6366f1, // Indigo
        fields: [
          {
            name: 'Page',
            value: payload.landing_page.name,
            inline: true,
          },
          {
            name: 'Email',
            value: payload.submission.email,
            inline: true,
          },
          {
            name: 'Name',
            value: payload.submission.name || '_Not provided_',
            inline: true,
          },
        ],
        description: fields || '_No additional fields_',
        footer: {
          text: `Bulk Emailer • ${payload.submission.submitted_at}`,
        },
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordPayload),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status}`);
  }
}

/**
 * Send email notification via the app's SMTP
 */
async function sendEmailNotification(recipient: string, payload: WebhookPayload): Promise<void> {
  try {
    const { createTransporter, getEnabledSmtpConfigs } = await import('./email');
    const configs = getEnabledSmtpConfigs();
    if (configs.length === 0) {
      console.error('[Webhook] No SMTP configured for email notifications');
      return;
    }
    const transporter = createTransporter(configs[0]);

    const fields = Object.entries(payload.submission.form_data)
      .map(([key, value]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#475569;">${key}</td><td style="padding:6px 12px;">${value}</td></tr>`)
      .join('');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:2rem;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:1.5rem;border-radius:0.75rem 0.75rem 0 0;text-align:center;">
          <h2 style="margin:0;font-size:1.2rem;">📩 New Landing Page Submission</h2>
          <p style="margin:0.5rem 0 0;opacity:0.9;font-size:0.85rem;">${payload.landing_page.name}</p>
        </div>
        <div style="background:#f8fafc;padding:1.5rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0.75rem 0.75rem;">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <tr style="background:#e2e8f0;">
              <td style="padding:8px 12px;font-weight:600;">Email</td>
              <td style="padding:8px 12px;">${payload.submission.email}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-weight:600;">Name</td>
              <td style="padding:8px 12px;">${payload.submission.name || 'Not provided'}</td>
            </tr>
            ${fields}
          </table>
          <p style="color:#94a3b8;font-size:0.75rem;margin:1rem 0 0;text-align:center;">
            Submitted at ${payload.submission.submitted_at}
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"Bulk Emailer" <notifications@bulkermailer.com>',
      to: recipient,
      subject: `📩 New Submission: ${payload.landing_page.name}`,
      html,
    });

    console.log(`[Webhook] Email notification sent to ${recipient}`);
  } catch (err: any) {
    console.error(`[Webhook] Email notification failed:`, err.message);
  }
}
