# Railway Deploy Checklist

## Verified locally before deploy (2026-09-11)

The following were validated against a production build (`next build` + `next start`)
with a simulated pre-migration database:

- ✅ `next build` completes (Turbopack, all routes + Proxy present)
- ✅ Old-schema DB (no `security` column) migrates on boot:
  `[DB] Added security column to smtp_config` →
  `[DB] Backfilled N SMTP config(s) with explicit security mode from the legacy secure flag`
  Legacy rows derive `ssl`/`starttls` from the old boolean flag — sending behavior unchanged.
- ✅ `npm start` boots; scheduler starts via instrumentation; healthcheck path `/login` answers 200
- ✅ `AUTH_SECRET` is read **at runtime** by both the proxy and the auth route
  (verified with three cookies: runtime-env secret → 200, code-default → 307, wrong secret → 307)

## Before first deploy

1. **Set `AUTH_SECRET` in Railway → Variables** (e.g. `openssl rand -hex 32`).
   Do this *before* the first deploy so no session cookie is ever minted with the
   built-in fallback secret. Changing it later invalidates all existing sessions.
2. **Do NOT commit `.env`** — it is gitignored and only for local dev.
3. **Mount a Railway volume at `/app/data`** — the SQLite DB lives there
   (`data/emailer.db`). Without a volume, data resets on every deploy.
   The app uses rollback journaling so committed data persists in the main DB file
   across container restarts (see commit dd2bfc9).

## Deploy

4. Build: Dockerfile builder (`railway.json`) → `npm ci` → `npx next build`.
   Native deps for better-sqlite3 (python3/make/g++) are installed in the image;
   Chromium/Puppeteer downloads are skipped via env vars.
5. Start: `npm start` (port from `$PORT`). Healthcheck: `/login`.

## After first deploy

6. Check logs for the two `[DB]` migration lines above (first boot only).
7. Run the migration regression test against the deployed DB if you need
   extra assurance: `npm test` (read-only, safe to run anywhere with DB access).
8. Smoke-test the deployed app: `SMOKE_BASE_URL=https://<app>.up.railway.app npm run smoke`
   (needs DB access for cookie minting; or pass `-- --cookie <value>`).
9. Verify SMTP: Settings → SMTP → Test Connection on one account.
   The result shows the negotiated mode (SSL/STARTTLS/Auto → resolved) and latency.
   Note: Railway blocks outbound SMTP ports on some regions — the app detects this
   and fails fast with a clear message (commit 5e9e612).

## Known limitations

- **WhatsApp Filter**: whatsapp-web.js needs Chromium at runtime; the Dockerfile
  intentionally skips its download, so WA features will not work in the container
  unless a Chromium package is added to the image.
- `/api/smtp/test` has `maxDuration = 30`; on self-hosted Docker this is a no-op
  (not serverless), fine on Railway.
