export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Server starting — initializing background scheduler');
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();

    // Gracefully close better-sqlite3 before process exits to prevent native crash
    const cleanup = () => {
      try {
        const { getDb } = require('./lib/db');
        const db = getDb();
        if (db && typeof db.close === 'function') {
          console.log('[Cleanup] Closing database gracefully...');
          db.close();
        }
      } catch {
        // ignore — db may already be closed
      }
      process.exit(0);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('beforeExit', cleanup);
  }
}
