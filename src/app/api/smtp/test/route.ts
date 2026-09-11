import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { buildSmtpTransportOptions, resolveSmtpSecurity } from '@/lib/email';
import type { SmtpConfig } from '@/lib/types';

export const maxDuration = 30;

/**
 * POST /api/smtp/test — verify an SMTP connection using the exact transport
 * options real sends use. Runs nodemailer's verify(): TCP connect → security
 * negotiation (SSL or STARTTLS) → AUTH. Sends no email.
 *
 * Accepts the same body as POST /api/smtp (the unsaved form payload), or
 * { id } to test an already-saved config (pulls fresh values from the DB).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = (await import('@/lib/db')).getDb();
    let config: SmtpConfig;

    if (body.id) {
      // Test a saved config — use its stored values (including stored password)
      const row = db.prepare('SELECT * FROM smtp_config WHERE id = ?').get(body.id) as SmtpConfig | undefined;
      if (!row) {
        return NextResponse.json({ success: false, error: 'SMTP config not found' }, { status: 404 });
      }
      config = row;
    } else {
      // Test unsaved form values
      if (!body.host || !body.user || !body.pass) {
        return NextResponse.json(
          { success: false, error: 'Host, Username and Password are required to test' },
          { status: 400 }
        );
      }
      config = {
        id: 'test-' + Date.now(),
        name: body.name || '',
        host: body.host,
        port: Number(body.port) || 587,
        secure: body.secure ? 1 : 0,
        security: body.security || null,
        user: body.user,
        pass: body.pass,
        from_name: body.from_name || '',
        from_email: body.from_email || '',
        enabled: 1,
        daily_limit: Number(body.daily_limit) || 0,
        hourly_limit: Number(body.hourly_limit) || 0,
        emails_sent: 0,
        last_used_at: null,
        created_at: '',
        updated_at: '',
      };
    }

    const sec = resolveSmtpSecurity(config);
    const modeLabel =
      config.security
        ? config.security === 'ssl' ? 'SSL/TLS (implicit)' :
          config.security === 'starttls' ? 'STARTTLS (upgrade after connect)' :
          `Auto → ${sec.secure ? 'SSL/TLS (port 465)' : 'STARTTLS'}`
        : sec.secure ? 'Legacy (secure flag) → SSL/TLS' : 'Legacy (secure flag) → plain/STARTTLS';

    const transport = nodemailer.createTransport(buildSmtpTransportOptions(config));

    const started = Date.now();
    await transport.verify();
    const elapsed = Date.now() - started;

    return NextResponse.json({
      success: true,
      host: config.host,
      port: config.port,
      security_mode: config.security || 'legacy',
      security_effective: sec.secure ? 'ssl' : 'starttls-or-plain',
      security_label: modeLabel,
      elapsed_ms: elapsed,
      message: `Connected to ${config.host}:${config.port} via ${modeLabel} — authenticated OK in ${(elapsed / 1000).toFixed(1)}s`,
    });
  } catch (error: any) {
    // Nodemailer errors carry useful codes (ECONNECTION, EAUTH, ESOCKET, ETLS…)
    const errCode = error?.code || 'ERROR';
    const errMsg = error?.message || String(error);
    const errCommand = error?.command ? ` (failed at: ${error.command})` : '';

    let hint = '';
    if (errCode === 'EAUTH') {
      hint = ' Authentication failed — check the username and app password.';
    } else if (errCode === 'ESOCKET' || /SSL|TLS/i.test(errMsg)) {
      hint = ' TLS handshake failed — the server likely does not support this security mode on this port. Try Auto or the other mode.';
    } else if (errCode === 'ECONNECTION' || errCode === 'ECONREFUSED') {
      hint = ' Could not reach the server — check the host and port, and that no firewall blocks outbound SMTP.';
    } else if (/timeout/i.test(errMsg)) {
      hint = ' Connection timed out — the host or port may be wrong, or the port is blocked.';
    }

    return NextResponse.json(
      {
        success: false,
        error_code: errCode,
        error: errMsg + errCommand + '.' + hint,
      },
      { status: 200 } // 200 so the client can render the failure detail, not a generic fetch error
    );
  }
}
