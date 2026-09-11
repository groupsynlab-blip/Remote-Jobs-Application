#!/usr/bin/env node
// Migration regression test: the SMTP security-mode migration + backfill must
// leave every smtp_config row with an explicit security mode. Fails (exit 1)
// if any row has NULL security, an unknown mode value, or a mode/secure-flag
// inconsistency — i.e. any config silently falling back to legacy inference.
//
// Run against the live database (read-only):
//   npm test          → node scripts/test-migrations.mjs
// Override the DB path with SMOKE_DB_PATH=/path/to/emailer.db npm test
//
// Requires the app to have run its migrations at least once (dev server boot
// or `next build` startup) so the security column and backfill exist.

import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.SMOKE_DB_PATH || path.join(process.cwd(), 'data', 'emailer.db');

let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

let db;
try {
  db = new Database(DB_PATH, { readonly: true });
} catch (err) {
  console.error(`❌ cannot open database at ${DB_PATH}: ${err.message}`);
  console.error('   Start the dev server once (migrations run on boot), then re-run.');
  process.exit(1);
}

// 1. Schema: the security column must exist.
const cols = db.prepare('PRAGMA table_info(smtp_config)').all().map((c) => c.name);
ok(cols.includes('security'), 'schema: smtp_config has a security column');

// 2. Data: no row may keep a NULL security value after the backfill.
const rows = db.prepare('SELECT id, name, host, port, secure, security FROM smtp_config').all();
const unmoded = rows.filter((r) => r.security === null || r.security === undefined);
ok(rows.length === 0 || unmoded.length === 0, 'data: every smtp_config row has an explicit security mode',
  unmoded.length ? `NULL rows: ${unmoded.map((r) => r.name || r.id).join(', ')}` : `rows=${rows.length}`);

// 3. Values: only known modes are allowed.
const VALID = new Set(['starttls', 'ssl', 'auto']);
const invalid = rows.filter((r) => r.security !== null && !VALID.has(r.security));
ok(invalid.length === 0, 'data: all security values are valid modes (starttls|ssl|auto)',
  invalid.length ? `bad values: ${invalid.map((r) => `${r.name}=${r.security}`).join(', ')}` : '');

// 4. Consistency: the backfill and the API keep the legacy flag in sync
//    (ssl → secure=1, starttls → secure=0). A mismatch means the two sources
//    of truth drifted apart.
const sslWrong = rows.filter((r) => r.security === 'ssl' && r.secure !== 1);
const starttlsWrong = rows.filter((r) => r.security === 'starttls' && r.secure !== 0);
ok(sslWrong.length === 0 && starttlsWrong.length === 0,
  'consistency: legacy secure flag matches the explicit mode',
  [...sslWrong, ...starttlsWrong].map((r) => `${r.name} (mode=${r.security}, secure=${r.secure})`).join(', '));

const counts = rows.reduce((acc, r) => { acc[r.security ?? 'NULL'] = (acc[r.security ?? 'NULL'] || 0) + 1; return acc; }, {});
console.log(`\n   SMTP rows by mode: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);

db.close();
console.log(failures === 0 ? '\n🎉 MIGRATION REGRESSION TEST PASSED' : `\n💥 ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
