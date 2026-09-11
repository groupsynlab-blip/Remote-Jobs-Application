#!/usr/bin/env node
// Behavioral test: pausing a sending campaign must stop it mid-flight.
// Uses a safe SMTP (127.0.0.1:465 → instant ECONNREFUSED, zero real email
// traffic). 5 contacts, 1s delay between emails → pause lands during email
// #2. PASS = a 'paused' SSE event arrives AND not all 5 emails were
// processed (some remain queued). Cleans up everything it creates.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const DB_PATH = process.env.SMOKE_DB_PATH || path.join(process.cwd(), 'data', 'emailer.db');
const MARK = 'pause-test-agent';
const N = 5;

function readEnvSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*AUTH_SECRET\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return 'bulk-emailer-session-secret-2024';
}
function readSessionEpoch() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'session_epoch'").get();
    db.close();
    return row ? parseInt(row.value, 10) || 0 : 0;
  } catch { return 0; }
}
function mintSessionCookie(secret, epoch) {
  const payload = Buffer.from(
    JSON.stringify({ auth: true, ts: Date.now(), exp: Date.now() + 30 * 24 * 60 * 60 * 1000, epoch })
  ).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

const COOKIE = mintSessionCookie(readEnvSecret(), readSessionEpoch());
const api = async (p, opts = {}) => {
  const res = await fetch(BASE + p, {
    redirect: 'manual', ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: `app_session=${COOKIE}`, ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* SSE or empty */ }
  return { status: res.status, body };
};

let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let db;
try { db = new Database(DB_PATH, { readonly: true }); } catch { db = null; }
const dbScalar = (sql, ...args) => Object.values(db.prepare(sql).get(...args) || {})[0];

let smtpId, tplId, listId, campId, contactIds = [];

try {
  // ── Setup: SMTP (local, can never deliver), template, 5-contact list, campaign ──
  const smtp = await api('/api/smtp', {
    method: 'POST',
    body: JSON.stringify({
      name: `[PAUSE-TEST] smtp ${Date.now()}`, host: '127.0.0.1', port: 465,
      security: 'ssl', user: 't@t.invalid', pass: 'x',
      from_email: 't@t.invalid', enabled: true,
    }),
  });
  ok(smtp.status === 200 && smtp.body?.success, 'setup: smtp created (127.0.0.1 — undeliverable by design)', `id=${smtp.body?.id}`);
  smtpId = smtp.body?.id;

  const tpl = await api('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ name: `[PAUSE-TEST] tpl ${Date.now()}`, subject: 'pause test', body: '<p>pause test</p>' }),
  });
  ok(tpl.status === 200 && tpl.body?.success, 'setup: template created', `id=${tpl.body?.id}`);
  tplId = tpl.body?.id;

  const emails = Array.from({ length: N }, (_, i) => `p${i}.${MARK}@example.invalid`);
  const imp = await api('/api/contacts/import', {
    method: 'POST',
    body: JSON.stringify({
      csvText: 'email,name\n' + emails.map((e, i) => `${e},Pause Test ${i + 1}`).join('\n'),
      listName: `[PAUSE-TEST] list ${Date.now()}`,
      columnMapping: { email: 0, name: 1 },
      duplicateAction: 'skip', createNewList: true,
    }),
  });
  ok(imp.status === 200 && imp.body?.imported === N, `setup: ${N} contacts imported`, JSON.stringify({ imported: imp.body?.imported, err: imp.body?.error }));
  listId = imp.body?.listId;
  if (db) contactIds = db.prepare("SELECT id FROM contacts WHERE email LIKE ?").all(`%${MARK}%`).map((r) => r.id);

  const camp = await api('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name: `[PAUSE-TEST] campaign ${Date.now()}`, template_id: tplId, contact_list_id: listId, delay_seconds: 1 }),
  });
  ok(camp.status === 200 && camp.body?.success, 'setup: campaign created (delay=1s)', `id=${camp.body?.id}`);
  campId = camp.body?.id;

  // Pin the campaign to ONLY the test SMTP — never touch the user's real
  // accounts, and 127.0.0.1:465 fails instantly so timing is deterministic.
  const pin = await api(`/api/campaigns/${campId}`, { method: 'PATCH', body: JSON.stringify({ selected_smtp_ids: [smtpId] }) });
  ok(pin.status === 200, 'setup: campaign pinned to test SMTP only', `status=${pin.status}`);

  // ── Start sending ──
  const send = await api(`/api/campaigns/${campId}`, { method: 'PATCH', body: JSON.stringify({ action: 'send' }) });
  ok(send.status === 200 && send.body?.queued === N, 'send started: emails queued', JSON.stringify(send.body));

  // ── Attach to the SSE stream, pause after the first progress event ──
  const events = [];
  let gotPausedEvent = false;
  const streamStart = Date.now();
  const controller = new AbortController();

  const streamPromise = (async () => {
    const res = await fetch(`${BASE}/api/campaigns/${campId}/stream`, {
      headers: { Cookie: `app_session=${COOKIE}`, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    ok(res.status === 200, 'stream attached', `status=${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              events.push(ev);
              if (ev.type === 'paused') gotPausedEvent = true;
            } catch { /* non-JSON */ }
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
  })();

  // Wait for the first progress event (email #1 attempted), then pause.
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !events.some((e) => e.type === 'progress')) await sleep(50);
  const firstProgressAt = Date.now() - streamStart;
  const pause = await api(`/api/campaigns/${campId}`, { method: 'PATCH', body: JSON.stringify({ action: 'pause' }) });
  ok(pause.status === 200 && pause.body?.status === 'paused', 'pause issued after first send attempt',
    `at t+${firstProgressAt}ms status=${pause.body?.status}`);

  // Stream must end on its own with a 'paused' event (not run to completion).
  const timeout = sleep(20000).then(() => 'timeout');
  await Promise.race([streamPromise, timeout]).then((r) => {
    if (r === 'timeout') { controller.abort(); ok(false, 'stream ended on its own', 'timed out after 20s'); }
    else ok(true, 'stream ended on its own', `${((Date.now() - streamStart) / 1000).toFixed(1)}s`);
  });

  const types = events.map((e) => e.type).join(',');
  ok(gotPausedEvent, "stream emitted 'paused' event", `events=[${types}]`);
  ok(!events.some((e) => e.type === 'done'), "stream did NOT run to completion (no 'done' event)", `events=[${types}]`);

  // ── DB/API verification: not all emails processed, status = paused ──
  const list = await api('/api/campaigns');
  const mine = (list.body || []).find((c) => c.id === campId);
  ok(!!mine && mine.status === 'paused', 'campaign status is paused', `status=${mine?.status}`);

  const detail = await api(`/api/campaigns/${campId}`);
  const st = detail.body?.stats || {};
  const processed = (st.total || 0) - (st.queued || 0);
  ok(processed < N, `pause stopped sending mid-flight (${processed}/${N} finalized, ${st.queued} still queued/unattempted)`,
    JSON.stringify({ total: st.total, queued: st.queued, sent: st.sent, failed: st.failed }));
  // With transient-retry semantics, attempted emails may be requeued (still
  // 'queued' status), so "an attempt happened" is proven by progress events.
  ok(events.some((e) => e.type === 'progress'), 'at least one email was attempted before the pause landed',
    `progress events=${events.filter((e) => e.type === 'progress').length}`);

  if (db) {
    const q = dbScalar("SELECT COUNT(*) c FROM email_logs WHERE campaign_id = ? AND status = 'queued'", campId);
    ok(q >= 1, 'queued emails remain in DB for resume', `queued=${q}`);
  }
} catch (e) {
  ok(false, 'unexpected error', e.message);
} finally {
  console.log('\n── cleanup ──');
  const del = async (p, label) => {
    try {
      const r = await api(p, { method: 'DELETE' });
      ok(r.status === 200, `cleanup: ${label}`, `status=${r.status}`);
    } catch (e) { ok(false, `cleanup: ${label}`, e.message); }
  };
  if (campId) await del(`/api/campaigns/${campId}`, 'delete test campaign (+logs)');
  if (smtpId) await del(`/api/smtp?id=${smtpId}`, 'delete test smtp');
  if (tplId) await del(`/api/templates?id=${tplId}`, 'delete test template');
  if (listId) await del(`/api/contacts?id=${listId}&type=list`, 'delete test list');
  for (const cid of contactIds) await del(`/api/contacts?id=${cid}&type=contact`, `delete test contact ${String(cid).slice(0, 8)}`);
  if (db) {
    try { db.prepare("DELETE FROM contact_list_members WHERE contact_list_id = ?").run(listId); } catch { /* noop */ }
    const c = dbScalar("SELECT COUNT(*) c FROM contacts WHERE email LIKE ?", `%${MARK}%`);
    const l = dbScalar("SELECT COUNT(*) c FROM contact_lists WHERE name LIKE ?", '%PAUSE-TEST%');
    const ca = dbScalar("SELECT COUNT(*) c FROM campaigns WHERE name LIKE ?", '%PAUSE-TEST%');
    const t = dbScalar("SELECT COUNT(*) c FROM email_templates WHERE name LIKE ?", '%PAUSE-TEST%');
    const s = dbScalar("SELECT COUNT(*) c FROM smtp_config WHERE name LIKE ?", '%PAUSE-TEST%');
    ok(c === 0 && l === 0 && ca === 0 && t === 0 && s === 0, 'cleanup verified: no test rows remain',
      `contacts=${c} lists=${l} campaigns=${ca} templates=${t} smtp=${s}`);
    db.close();
  }
}

console.log(failures === 0 ? '\n🎉 PAUSE TEST PASSED — pause stops a sending campaign mid-flight' : `\n💥 ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
