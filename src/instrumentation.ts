export async function register() {
  // Only run in Node.js server runtime (not edge, not client)
  // Use dynamic import to prevent Edge Runtime from trying to compile
  // Node.js-only modules (better-sqlite3, path) in the scheduler import chain
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Server starting — initializing background scheduler');
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
