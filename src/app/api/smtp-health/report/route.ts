import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/smtp-health/report?days=7&smtp_id=xxx
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');
    const smtpId = searchParams.get('smtp_id');

    // Get SMTP configs
    const configs = db.prepare('SELECT * FROM smtp_config ORDER BY created_at ASC').all() as any[];

    // Build per-SMTP data
    const smtpData = configs.map((c) => {
      const whereClause = smtpId ? `AND el.smtp_config_id = '${smtpId}'` : '';
      const smtpWhere = `el.smtp_config_id = '${c.id}'`;

      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN el.status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN el.status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN el.status = 'queued' THEN 1 ELSE 0 END) as queued
        FROM email_logs el
        WHERE ${smtpWhere} AND el.sent_at > datetime('now', '-' || ? || ' days')
      `).get(days) as any;

      const dailyStats = db.prepare(`
        SELECT date(el.sent_at) as day, 
          COUNT(*) as total,
          SUM(CASE WHEN el.status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN el.status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM email_logs el
        WHERE ${smtpWhere} AND el.sent_at > datetime('now', '-' || ? || ' days')
        GROUP BY date(el.sent_at)
        ORDER BY day ASC
      `).all(days) as any[];

      const hourlyUsed = db.prepare(
        `SELECT COUNT(*) as count FROM smtp_rate_tracking WHERE smtp_config_id = ? AND sent_at > datetime('now', '-1 hour')`
      ).get(c.id) as { count: number };

      const dailyUsed = db.prepare(
        `SELECT COUNT(*) as count FROM smtp_rate_tracking WHERE smtp_config_id = ? AND sent_at > datetime('now', 'start of day')`
      ).get(c.id) as { count: number };

      const lastUsed = db.prepare(
        `SELECT sent_at FROM smtp_rate_tracking WHERE smtp_config_id = ? ORDER BY sent_at DESC LIMIT 1`
      ).get(c.id) as { sent_at: string } | undefined;

      return {
        name: c.name,
        from_email: c.from_email,
        enabled: c.enabled,
        daily_limit: c.daily_limit,
        hourly_limit: c.hourly_limit,
        hourly_used: hourlyUsed.count,
        daily_used: dailyUsed.count,
        total: stats?.total || 0,
        sent: stats?.sent || 0,
        failed: stats?.failed || 0,
        queued: stats?.queued || 0,
        success_rate: stats?.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : '0.0',
        daily_stats: dailyStats,
        last_used: lastUsed?.sent_at || null,
      };
    });

    // Overall stats
    const overallStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM email_logs
      WHERE sent_at > datetime('now', '-' || ? || ' days')
    `).get(days) as any;

    const now = new Date();
    const reportDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const reportTime = now.toLocaleTimeString('en-US');

    // Generate HTML report
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SMTP Delivery Report - ${reportDate}</title>
  <style>
    @media print {
      body { font-size: 10pt; }
      .no-print { display: none; }
      .page-break { page-break-before: always; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #fff; padding: 2rem; max-width: 900px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 3px solid #6366f1; padding-bottom: 1.5rem; margin-bottom: 2rem; }
    .header h1 { font-size: 1.75rem; color: #1a1a2e; margin-bottom: 0.25rem; }
    .header p { color: #666; font-size: 0.9rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: center; }
    .summary-card .value { font-size: 1.5rem; font-weight: 700; color: #6366f1; }
    .summary-card .label { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    .section { margin-bottom: 2rem; }
    .section h2 { font-size: 1.1rem; color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #f1f5f9; text-align: left; padding: 0.6rem 0.75rem; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; }
    tr:hover td { background: #f8fafc; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 1rem; font-size: 0.7rem; font-weight: 600; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fef2f2; color: #991b1b; }
    .badge-yellow { background: #fefce8; color: #854d0e; }
    .badge-gray { background: #f1f5f9; color: #64748b; }
    .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; }
    .daily-chart { display: flex; align-items: flex-end; gap: 2px; height: 80px; margin-top: 0.5rem; }
    .daily-bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
    .daily-bar .sent { background: #10b981; }
    .daily-bar .failed { background: #ef4444; }
    .daily-label { font-size: 0.6rem; color: #94a3b8; text-align: center; margin-top: 2px; }
    .footer { text-align: center; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.75rem; }
    .print-btn { display: inline-block; padding: 0.75rem 1.5rem; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 0.9rem; cursor: pointer; margin-top: 1rem; }
    .print-btn:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: right; margin-bottom: 1rem;">
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="header">
    <h1>📊 SMTP Delivery Report</h1>
    <p>${reportDate} at ${reportTime} • Last ${days} days</p>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${overallStats?.total || 0}</div>
      <div class="label">Total Emails</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color: #10b981;">${overallStats?.sent || 0}</div>
      <div class="label">Delivered</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color: #ef4444;">${overallStats?.failed || 0}</div>
      <div class="label">Failed</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color: #6366f1;">${overallStats?.total > 0 ? ((overallStats.sent / overallStats.total) * 100).toFixed(1) : '0.0'}%</div>
      <div class="label">Success Rate</div>
    </div>
  </div>

  <div class="section">
    <h2>📧 SMTP Account Performance</h2>
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Email</th>
          <th>Status</th>
          <th>Sent</th>
          <th>Failed</th>
          <th>Success Rate</th>
          <th>Daily Usage</th>
          <th>Last Used</th>
        </tr>
      </thead>
      <tbody>
        ${smtpData.map(s => `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td style="color: #64748b; font-size: 0.8rem;">${s.from_email}</td>
          <td>${s.enabled 
            ? '<span class="badge badge-green">✅ Active</span>' 
            : '<span class="badge badge-gray">⏸️ Disabled</span>'}</td>
          <td style="font-weight: 600;">${s.sent}</td>
          <td style="color: ${s.failed > 0 ? '#ef4444' : '#10b981'}; font-weight: 600;">${s.failed}</td>
          <td>
            <span class="badge ${parseFloat(s.success_rate) >= 95 ? 'badge-green' : parseFloat(s.success_rate) >= 80 ? 'badge-yellow' : 'badge-red'}">
              ${s.success_rate}%
            </span>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="progress-bar" style="width: 60px;">
                <div class="progress-fill" style="width: ${s.daily_limit > 0 ? (s.daily_used / s.daily_limit * 100) : 0}%; background: ${s.daily_used / s.daily_limit > 0.9 ? '#ef4444' : s.daily_used / s.daily_limit > 0.7 ? '#f59e0b' : '#10b981'};"></div>
              </div>
              <span style="font-size: 0.75rem;">${s.daily_used}/${s.daily_limit}</span>
            </div>
          </td>
          <td style="font-size: 0.75rem; color: #64748b;">${s.last_used ? new Date(s.last_used + 'Z').toLocaleDateString() : 'Never'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>📈 Daily Sending Breakdown</h2>
    ${smtpData.filter(s => s.daily_stats.length > 0).map(s => `
    <div style="margin-bottom: 1.5rem;">
      <h3 style="font-size: 0.9rem; margin-bottom: 0.5rem;">${s.name} (${s.from_email})</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Sent</th>
            <th>Failed</th>
            <th>Total</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          ${s.daily_stats.map(d => `
          <tr>
            <td>${d.day}</td>
            <td style="color: #10b981; font-weight: 600;">${d.sent || 0}</td>
            <td style="color: ${d.failed > 0 ? '#ef4444' : '#10b981'};">${d.failed || 0}</td>
            <td>${d.total}</td>
            <td>${d.total > 0 ? (((d.sent || 0) / d.total) * 100).toFixed(1) : '0.0'}%</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>⏰ Limit Information</h2>
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Daily Limit</th>
          <th>Hourly Limit</th>
          <th>Daily Reset</th>
          <th>Hourly Reset</th>
        </tr>
      </thead>
      <tbody>
        ${smtpData.map(s => `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.daily_limit} emails</td>
          <td>${s.hourly_limit} emails</td>
          <td>Midnight Pacific Time</td>
          <td>Rolling 60-min window</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>Generated by Bulk Emailer • ${reportDate} at ${reportTime}</p>
    <p>Daily limits reset at midnight Pacific Time (PDT/PST)</p>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="smtp-report-${now.toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate report' }, { status: 500 });
  }
}
