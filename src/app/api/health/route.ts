import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

/**
 * GET /api/health — unauthenticated liveness endpoint.
 * Lets Railway healthchecks and uptime monitors verify the app is
 * serving without needing a session. Reports only non-sensitive
 * diagnostics: DB reachability/size and where the data dir lives
 * (used to verify volume mounts). No user data is exposed.
 */
export async function GET() {
  let db: { ok: boolean; sizeBytes?: number; error?: string } = { ok: false };
  try {
    const d = getDb();
    const row = d.prepare(
      'SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()'
    ).get() as { size: number };
    db = { ok: true, sizeBytes: row.size };
  } catch {
    db = { ok: false, error: 'db unreachable' };
  }

  // Filesystem diagnostics (names/sizes only — no contents)
  const cwd = process.cwd();
  const dataDir = path.join(cwd, 'data');
  let dataDirInfo: { exists: boolean; files?: { name: string; size: number }[] } = { exists: fs.existsSync(dataDir) };
  if (dataDirInfo.exists) {
    try {
      dataDirInfo.files = fs.readdirSync(dataDir).map((name) => {
        const st = fs.statSync(path.join(dataDir, name));
        return { name, size: st.size };
      });
    } catch {
      // ignore
    }
  }

  // Mount diagnostics: /proc/mounts (Linux containers) lists every mountpoint;
  // a Railway volume mounted at /app/data appears there as its own entry.
  let mountCheck: {
    procMountsAvailable: boolean;
    appMount: string | null;
    dataMount: string | null;
    volumeMounted: boolean;
  } = { procMountsAvailable: false, appMount: null, dataMount: null, volumeMounted: false };
  try {
    if (fs.existsSync('/proc/mounts')) {
      mountCheck.procMountsAvailable = true;
      const lines = fs.readFileSync('/proc/mounts', 'utf8').split('\n');
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          if (parts[1] === '/app' && !mountCheck.appMount) mountCheck.appMount = `${parts[0]} ${parts[2]}`;
          if (parts[1] === '/app/data') mountCheck.dataMount = `${parts[0]} ${parts[2]}`;
        }
      }
      mountCheck.volumeMounted = mountCheck.dataMount !== null;
    }
  } catch {
    // /proc/mounts unavailable (non-Linux) — leave defaults
  }

  return NextResponse.json({
    ok: true,
    service: 'bulk-emailer',
    cwd,
    dataDir: dataDirInfo,
    mountCheck,
    db,
    time: new Date().toISOString(),
  });
}
