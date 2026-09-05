import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/track/click?id=xxx&url=yyy
 * Tracks link clicks and redirects to the original URL.
 * Anti-abuse: the tracking id must exist in email_logs, so third parties
 * cannot use this endpoint as a general-purpose open redirector. The
 * destination must also be a well-formed http(s) URL.
 */
function isSafeRedirectUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    // Only http(s), and block credentials-in-URL tricks
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return true;
  } catch {
    return false;
  }
}

/** Public origin of this deployment (proxy headers first — behind Railway etc.
 *  request.url can point at the internal container address). */
function siteOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackingId = searchParams.get('id');
  const url = searchParams.get('url');

  const fallback = () => Response.redirect(new URL('/', siteOrigin(request)).toString(), 302);

  if (!trackingId) return fallback();

  try {
    const db = getDb();

    // The id must belong to a real sent email — otherwise redirect home.
    const log = db.prepare(
      `SELECT campaign_id FROM email_logs WHERE tracking_id = ?`
    ).get(trackingId) as { campaign_id: string } | undefined;

    if (!log) return fallback();

    db.prepare(
      `INSERT INTO email_clicks (tracking_id, url, user_agent, ip_address)
       VALUES (?, ?, ?, ?)`
    ).run(
      trackingId,
      url ? decodeURIComponent(url) : '',
      request.headers.get('user-agent') || '',
      request.headers.get('x-forwarded-for') || ''
    );

    // Update campaign click count
    const clicks = db.prepare(
      `SELECT COUNT(DISTINCT tracking_id) as c FROM email_clicks WHERE tracking_id IN
       (SELECT tracking_id FROM email_logs WHERE campaign_id = ?)`
    ).get(log.campaign_id) as { c: number };
    db.prepare(`UPDATE campaigns SET click_count = ? WHERE id = ?`).run(clicks.c, log.campaign_id);
  } catch (err) {
    console.error('[Click Track] Error:', err);
  }

  // Redirect to original URL (or fallback) — validated to avoid open-redirect abuse
  const candidate = url ? decodeURIComponent(url) : '/';
  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return Response.redirect(new URL(candidate, siteOrigin(request)).toString(), 302);
  }
  if (isSafeRedirectUrl(candidate)) {
    return Response.redirect(candidate, 302);
  }
  return fallback();
}
