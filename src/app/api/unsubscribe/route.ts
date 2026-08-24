import { NextRequest, NextResponse } from 'next/server';
import { addUnsubscribe, getSetting } from '@/lib/db';

// GET /api/unsubscribe?email=xxx&campaign=xxx
// Shows a confirmation page, or processes the unsubscribe directly
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const campaignId = searchParams.get('campaign');

  if (!email) {
    return new NextResponse(unsubscribePage('Missing email address', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Record the unsubscribe
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : null;
  const userAgent = request.headers.get('user-agent') || null;

  addUnsubscribe(email, campaignId || undefined, ip || undefined, userAgent || undefined);

  return new NextResponse(unsubscribePage(email, true), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function unsubscribePage(email: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .card {
      background: white;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    .email { color: #6366f1; font-weight: 600; }
    p { color: #64748b; font-size: 0.9rem; line-height: 1.6; margin-top: 0.5rem; }
    .note { font-size: 0.8rem; color: #94a3b8; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    ${success ? `
      <div class="icon">✅</div>
      <h1>You've been unsubscribed</h1>
      <p>The email address <span class="email">${email}</span> has been removed from our mailing list.</p>
      <p>You will no longer receive emails from this campaign.</p>
    ` : `
      <div class="icon">⚠️</div>
      <h1>Unsubscribe Error</h1>
      <p>There was a problem processing your unsubscribe request.</p>
    `}
    <div class="note">
      If you believe this is an error, please contact the sender directly.
    </div>
  </div>
</body>
</html>`;
}
