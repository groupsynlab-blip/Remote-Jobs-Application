#!/usr/bin/env node
// Smoke suite for bulk-emailer: auth gate → contacts import → DRAFT campaign
// compose → analytics → verified cleanup. Never sends an email.
//
// Usage:
//   npm run smoke                         (mints a session cookie itself)
//   npm run smoke -- --cookie <value>     (use an externally provided cookie)
//   SMOKE_BASE_URL=http://host:3000 npm run smoke
//
// Cookie minting reads AUTH_SECRET from .env and the session epoch from the
// local SQLite DB, producing exactly the cookie POST /api/auth would set.
// Requires a reachable dev/prod server; exits 0 on success, 1 on any failure.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const DB_PATH = process.env.SMOKE_DB_PATH || path.join(process.cwd(), 'data', 'emailer.db');

// ── Cookie minting ────────────────────────────────────────────────────────────

function readEnvSecret() {
  // 1. explicit env var (CI), 2. .env file, 3. code default
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*AUTH_SECRET\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return 'bulk-emailer-session-secret-2024'; // code default when no .env exists
}

function readSessionEpoch() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'session_epoch'").get();
    db.close();
    return row ? parseInt(row.value, 10) || 0 : 0;
  } catch {
    return 0; // DB unavailable — server treats missing epoch as 0
  }
}

function mintSessionCookie(secret, epoch) {
  const payload = Buffer.from(
    JSON.stringify({ auth: true, ts: Date.now(), exp: Date.now() + 30 * 24 * 60 * 60 * 1000, epoch })
  ).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const cookieArgIdx = process.argv.indexOf('--cookie');
const COOKIE =
  cookieArgIdx !== -1 && process.argv[cookieArgIdx + 1]
    ? process.argv[cookieArgIdx + 1]
    : mintSessionCookie(readEnvSecret(), readSessionEpoch());

const MARK = 'smoke-test-agent';
const csvEmails = [
  `smoke.a.${MARK}@example.invalid`,
  `smoke.b.${MARK}@example.invalid`,
  `smoke.c.${MARK}@example.invalid`,
];

let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

let db;
const dbScalar = (sql, ...args) => Object.values(db.prepare(sql).get(...args) || {})[0];

let smokeListId, smokeTemplateId, smokeCampaignId, smokeSmtpId, smokeContactIds = [];

const api = async (p, opts = {}) => {
  const res = await fetch(BASE + p, {
    redirect: 'manual',
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: `app_session=${COOKIE}`, ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, location: res.headers.get('location'), body };
};

try { db = new Database(DB_PATH, { readonly: true }); } catch { db = null; }

// ── Tests ─────────────────────────────────────────────────────────────────────
try {
  // 1. Auth gate
  const anon = await fetch(BASE + '/api/stats', { redirect: 'manual' });
  ok(anon.status === 307 && (anon.headers.get('location') || '').startsWith('/login'),
    'auth gate: unauthenticated /api/stats redirects to /login', `status=${anon.status}`);
  const authed = await api('/api/stats');
  ok(authed.status === 200 && typeof authed.body?.totalContacts === 'number',
    'auth: session cookie grants access', `totalContacts=${authed.body?.totalContacts}`);

  // 2. Contacts import
  const csv = 'email,name,company\n' + csvEmails.map((e, i) => `${e},Smoke Tester ${i + 1},Smoke Test Co`).join('\n');
  const imp = await api('/api/contacts/import', {
    method: 'POST',
    body: JSON.stringify({
      csvText: csv,
      listName: `[SMOKE-TEST] Agent list ${new Date().toISOString()}`,
      columnMapping: { email: 0, name: 1, company: 2 },
      duplicateAction: 'skip',
      createNewList: true,
    }),
  });
  ok(imp.status === 200 && imp.body?.success && imp.body?.imported === 3,
    'contacts import: 3 rows imported', JSON.stringify({ imported: imp.body?.imported, skipped: imp.body?.skipped, err: imp.body?.error }));
  smokeListId = imp.body?.listId;

  if (db) {
    const memberCount = dbScalar("SELECT COUNT(*) c FROM contact_list_members WHERE contact_list_id = ?", smokeListId);
    ok(memberCount === 3, 'contacts import: list has 3 members in DB', `count=${memberCount}`);
    smokeContactIds = db.prepare("SELECT id FROM contacts WHERE email LIKE ?").all(`%${MARK}%`).map((r) => r.id);
    ok(smokeContactIds.length === 3, 'contacts import: 3 contacts present in DB', `ids=${smokeContactIds.length}`);
  } else {
    console.log('⏭️  DB checks skipped (data/emailer.db not readable)');
  }

  // 3. Campaign compose (DRAFT ONLY — never sent)
  const tpl = await api('/api/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: `[SMOKE-TEST] Template ${Date.now()}`,
      subject: '[SMOKE-TEST] Do not send',
      body: '<p>Smoke test template — safe to delete.</p>',
    }),
  });
  ok(tpl.status === 200 && tpl.body?.success, 'template created for campaign', `id=${tpl.body?.id}`);
  smokeTemplateId = tpl.body?.id;

  const camp = await api('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: `[SMOKE-TEST] Draft campaign ${Date.now()}`,
      template_id: smokeTemplateId,
      contact_list_id: smokeListId,
      delay_seconds: 2,
    }),
  });
  ok(camp.status === 200 && camp.body?.success, 'campaign compose: draft campaign created',
    `id=${camp.body?.id} total_count=${camp.body?.total_count}`);
  smokeCampaignId = camp.body?.id;

  const camps = await api('/api/campaigns');
  const mine = (camps.body || []).find((c) => c.id === smokeCampaignId);
  ok(!!mine && mine.status === 'draft', 'campaign compose: campaign appears in list as draft', `status=${mine?.status}`);

  const detail = await api(`/api/campaigns/${smokeCampaignId}`);
  ok(detail.status === 200 && detail.body?.campaign?.id === smokeCampaignId, 'campaign detail endpoint renders',
    `stats.total=${detail.body?.stats?.total}`);

  // 4. Analytics
  const ov = await api('/api/analytics');
  ok(ov.status === 200 && ov.body?.overview && typeof ov.body.overview.total_sent === 'number',
    'analytics overview renders', `total_sent=${ov.body?.overview?.total_sent}`);

  const mineAn = await api(`/api/analytics?campaignId=${smokeCampaignId}`);
  ok(mineAn.status === 200 && mineAn.body?.campaign && Number(mineAn.body.campaign.open_rate) === 0,
    'analytics: smoke campaign (zero sends) renders with 0% open rate');

  const realId = authed.body?.recentCampaigns?.[0]?.id;
  if (realId) {
    const realAn = await api(`/api/analytics?campaignId=${realId}`);
    ok(realAn.status === 200 && realAn.body?.campaign, 'analytics: real campaign renders (read-only)', `id=${realId}`);
  }

  // 5. SMTP security modes — seed a test config so this is meaningful even on a fresh DB
  const seeded = await api('/api/smtp', {
    method: 'POST',
    body: JSON.stringify({
      name: '[SMOKE-TEST] smtp', host: 'smtp.example.com', port: 587,
      security: 'starttls', user: 'smoke@example.com', pass: 'not-real',
      from_email: 'smoke@example.com', enabled: false,
    }),
  });
  ok(seeded.status === 200 && seeded.body?.success, 'smtp: seeded test config', `id=${seeded.body?.id}`);
  smokeSmtpId = seeded.body?.id;

  const smtps = await api('/api/smtp');
  const mySmtp = (smtps.body || []).find((c) => c.id === smokeSmtpId);
  ok(smtps.status === 200 && Array.isArray(smtps.body), 'smtp list renders', `configs=${smtps.body?.length}`);
  ok(!!mySmtp && mySmtp.security === 'starttls', 'smtp security: seeded config carries its explicit mode', `mode=${mySmtp?.security}`);
  const unmoded = (smtps.body || []).filter((c) => !c.security);
  ok(unmoded.length === 0, 'smtp security: every config has an explicit mode (no legacy NULL)',
    unmoded.length ? `missing: ${unmoded.map((c) => c.name).join(', ')}` : `modes=${[...new Set((smtps.body || []).map((c) => c.security))].join('/')}`);

  // 6. Confirm nothing was sent
  if (db) {
    const logs = dbScalar("SELECT COUNT(*) c FROM email_logs WHERE campaign_id = ?", smokeCampaignId);
    ok(logs === 0, 'safety: zero email_logs rows for smoke campaign (nothing was sent)', `logs=${logs}`);
  }
} finally {
  // ── 6. Cleanup (always) ──
  console.log('\n── cleanup ──');
  const del = async (p, label) => {
    try {
      const r = await api(p, { method: 'DELETE' });
      ok(r.status === 200, `cleanup: ${label}`, `status=${r.status}`);
    } catch (e) { ok(false, `cleanup: ${label}`, e.message); }
  };
  if (smokeCampaignId) await del(`/api/campaigns/${smokeCampaignId}`, 'delete smoke campaign');
  if (smokeSmtpId) await del(`/api/smtp?id=${smokeSmtpId}`, 'delete smoke smtp config');
  if (smokeTemplateId) await del(`/api/templates?id=${smokeTemplateId}`, 'delete smoke template');
  if (smokeListId) await del(`/api/contacts?id=${smokeListId}&type=list`, 'delete smoke list');
  for (const cid of smokeContactIds) await del(`/api/contacts?id=${cid}&type=contact`, `delete smoke contact ${String(cid).slice(0, 8)}`);
  if (db && smokeListId) {
    try { db.prepare('DELETE FROM contact_list_members WHERE contact_list_id = ?').run(smokeListId); console.log('✅ cleanup: orphaned member rows removed'); } catch { /* noop */ }
  }
  if (db) {
    const lc = dbScalar("SELECT COUNT(*) c FROM contacts WHERE email LIKE ?", `%${MARK}%`);
    const ll = dbScalar("SELECT COUNT(*) c FROM contact_lists WHERE name LIKE ?", '%SMOKE-TEST%');
    const lca = dbScalar("SELECT COUNT(*) c FROM campaigns WHERE name LIKE ?", '%SMOKE-TEST%');
    const lt = dbScalar("SELECT COUNT(*) c FROM email_templates WHERE name LIKE ?", '%SMOKE-TEST%');
    const ls = dbScalar("SELECT COUNT(*) c FROM smtp_config WHERE name LIKE ?", '%SMOKE-TEST%');
    ok(lc === 0 && ll === 0 && lca === 0 && lt === 0 && ls === 0, 'cleanup verified: no smoke rows remain',
      `contacts=${lc} lists=${ll} campaigns=${lca} templates=${lt} smtp=${ls}`);
  }
  db?.close();
}

console.log(failures === 0 ? '\n🎉 ALL SMOKE TESTS PASSED' : `\n💥 ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
