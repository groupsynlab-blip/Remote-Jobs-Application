import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getAllSmtpRateUsage, cleanupRateTracking } from '@/lib/email';
import type { SmtpConfig } from '@/lib/types';

// GET /api/smtp - Get all SMTP configs with rate usage
export async function GET() {
  try {
    const db = getDb();
    const configs = db.prepare('SELECT * FROM smtp_config ORDER BY created_at ASC').all() as SmtpConfig[];
    const usage = getAllSmtpRateUsage();

    const configsWithUsage = configs.map((c) => ({
      ...c,
      rate_usage: usage[c.id] || { hourly_used: 0, daily_used: 0 },
    }));

    return NextResponse.json(configsWithUsage);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get SMTP configs' }, { status: 500 });
  }
}

// POST /api/smtp - Create a new SMTP config
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO smtp_config (id, name, host, port, secure, user, pass, from_name, from_email, enabled, daily_limit, hourly_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name || '',
      body.host,
      body.port || 587,
      body.secure ? 1 : 0,
      body.user,
      body.pass,
      body.from_name,
      body.from_email,
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1,
      body.daily_limit || 0,
      body.hourly_limit || 0
    );

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create SMTP config' }, { status: 500 });
  }
}

// PUT /api/smtp - Update an existing SMTP config
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const db = getDb();

    db.prepare(`
      UPDATE smtp_config SET
        name = ?,
        host = ?,
        port = ?,
        secure = ?,
        user = ?,
        pass = ?,
        from_name = ?,
        from_email = ?,
        enabled = ?,
        daily_limit = ?,
        hourly_limit = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      body.name || '',
      body.host,
      body.port || 587,
      body.secure ? 1 : 0,
      body.user,
      body.pass,
      body.from_name,
      body.from_email,
      body.enabled ? 1 : 0,
      body.daily_limit || 0,
      body.hourly_limit || 0,
      body.id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update SMTP config' }, { status: 500 });
  }
}

// PATCH /api/smtp - Toggle, reset counters, or reset rate tracking
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    if (body.action === 'toggle' && body.id) {
      db.prepare(
        "UPDATE smtp_config SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?"
      ).run(body.id);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'reset_counters' && body.id) {
      db.prepare(
        "UPDATE smtp_config SET emails_sent = 0, last_used_at = NULL, updated_at = datetime('now') WHERE id = ?"
      ).run(body.id);
      db.prepare('DELETE FROM smtp_rate_tracking WHERE smtp_config_id = ?').run(body.id);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'cleanup_tracking') {
      cleanupRateTracking();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update SMTP config' }, { status: 500 });
  }
}

// DELETE /api/smtp?id=xxx - Delete an SMTP config
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const db = getDb();
    db.prepare('DELETE FROM smtp_config WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete SMTP config' }, { status: 500 });
  }
}
