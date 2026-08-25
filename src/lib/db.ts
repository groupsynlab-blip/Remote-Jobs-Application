import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'emailer.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    
    // Migration: add phone/address columns if missing
    try { db.exec("ALTER TABLE contacts ADD COLUMN phone TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE contacts ADD COLUMN address TEXT DEFAULT ''"); } catch {}
    db.pragma('foreign_keys = ON');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  try {
  db.exec(`
    -- ═══ Tables ═══

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_list_members (
      contact_list_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      PRIMARY KEY (contact_list_id, contact_id),
      FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template_id TEXT NOT NULL,
      contact_list_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      delay_seconds INTEGER NOT NULL DEFAULT 2,
      reply_to TEXT,
      subject_rotation TEXT,
      template_rotation TEXT,
      enable_tracking INTEGER NOT NULL DEFAULT 1,
      enable_unsubscribe INTEGER NOT NULL DEFAULT 1,
      total_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      open_count INTEGER NOT NULL DEFAULT 0,
      unsubscribe_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      FOREIGN KEY (template_id) REFERENCES email_templates(id),
      FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id)
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      tracking_id TEXT UNIQUE,
      campaign_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      error_message TEXT,
      sent_at TEXT,
      smtp_config_id TEXT,
      subject_used TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS email_opens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_agent TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS email_bounces (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      bounce_type TEXT NOT NULL DEFAULT 'hard',
      campaign_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_email_bounces_email ON email_bounces(email);

    CREATE TABLE IF NOT EXISTS domain_throttling (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_domain_throttling_domain ON domain_throttling(domain);

    CREATE TABLE IF NOT EXISTS unsubscribes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      campaign_id TEXT,
      unsubscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip_address TEXT,
      user_agent TEXT,
      UNIQUE(email)
    );

    CREATE TABLE IF NOT EXISTS smtp_config (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 587,
      secure INTEGER NOT NULL DEFAULT 0,
      user TEXT NOT NULL DEFAULT '',
      pass TEXT NOT NULL DEFAULT '',
      from_name TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      daily_limit INTEGER NOT NULL DEFAULT 0,
      hourly_limit INTEGER NOT NULL DEFAULT 0,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS smtp_rate_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      smtp_config_id TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (smtp_config_id) REFERENCES smtp_config(id) ON DELETE CASCADE
    );

    -- ═══ Indexes (AFTER tables) ═══

    CREATE INDEX IF NOT EXISTS idx_opens_tracking ON email_opens(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_rate_tracking_config_time
      ON smtp_rate_tracking(smtp_config_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);

    -- ═══ Email Verifier Tables ═══

    CREATE TABLE IF NOT EXISTS verification_jobs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'quick',
      status TEXT NOT NULL DEFAULT 'pending',
      total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      valid_count INTEGER NOT NULL DEFAULT 0,
      invalid_count INTEGER NOT NULL DEFAULT 0,
      risky_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS verification_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      syntax_valid INTEGER NOT NULL DEFAULT 0,
      mx_valid INTEGER NOT NULL DEFAULT 0,
      smtp_valid INTEGER,
      is_disposable INTEGER NOT NULL DEFAULT 0,
      is_role_account INTEGER NOT NULL DEFAULT 0,
      is_catch_all INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES verification_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_verify_job ON verification_results(job_id);
    CREATE INDEX IF NOT EXISTS idx_verify_status ON verification_results(job_id, status);

    -- ═══ Email Scraper Tables ═══

    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'search',
      status TEXT NOT NULL DEFAULT 'pending',
      query TEXT NOT NULL DEFAULT '',
      search_engines TEXT,
      max_results INTEGER NOT NULL DEFAULT 50,
      crawl_depth INTEGER NOT NULL DEFAULT 1,
      total_pages_scraped INTEGER NOT NULL DEFAULT 0,
      total_emails_found INTEGER NOT NULL DEFAULT 0,
      unique_emails INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS scrape_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      email TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      page_title TEXT,
      domain TEXT NOT NULL DEFAULT '',
      search_engine TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES scrape_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scrape_job ON scrape_results(job_id);
    CREATE INDEX IF NOT EXISTS idx_scrape_email ON scrape_results(job_id, email);
    CREATE INDEX IF NOT EXISTS idx_scrape_domain ON scrape_results(job_id, domain);

    -- ═══ Landing Page Builder Tables ═══

    CREATE TABLE IF NOT EXISTS landing_pages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      form_fields TEXT NOT NULL DEFAULT '["email","name"]',
      success_message TEXT NOT NULL DEFAULT 'Thank you for submitting!',
      theme TEXT NOT NULL DEFAULT 'default',
      custom_css TEXT NOT NULL DEFAULT '',
      target_list_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      view_count INTEGER NOT NULL DEFAULT 0,
      submission_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (target_list_id) REFERENCES contact_lists(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS landing_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      landing_page_id TEXT NOT NULL,
      form_data TEXT NOT NULL DEFAULT '{}',
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_landing_page_slug ON landing_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_landing_submissions_page ON landing_submissions(landing_page_id);

    -- ═══ Email Warmup Tables ═══

    CREATE TABLE IF NOT EXISTS warmup_configs (
      id TEXT PRIMARY KEY,
      smtp_config_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      daily_limit INTEGER NOT NULL DEFAULT 5,
      current_day INTEGER NOT NULL DEFAULT 0,
      total_days INTEGER NOT NULL DEFAULT 30,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (smtp_config_id) REFERENCES smtp_config(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS warmup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warmup_id TEXT NOT NULL,
      smtp_config_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'sent',
      error_message TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warmup_id) REFERENCES warmup_configs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_warmup_config ON warmup_configs(smtp_config_id);
    CREATE INDEX IF NOT EXISTS idx_warmup_logs_warmup ON warmup_logs(warmup_id);

    -- ═══ A/B Testing Tables ═══

    CREATE TABLE IF NOT EXISTS ab_tests (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      variant_a_subject TEXT NOT NULL DEFAULT '',
      variant_b_subject TEXT NOT NULL DEFAULT '',
      variant_a_body TEXT NOT NULL DEFAULT '',
      variant_b_body TEXT NOT NULL DEFAULT '',
      split_ratio REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'pending',
      winner TEXT,
      test_size INTEGER NOT NULL DEFAULT 100,
      variant_a_sent INTEGER NOT NULL DEFAULT 0,
      variant_b_sent INTEGER NOT NULL DEFAULT 0,
      variant_a_opens INTEGER NOT NULL DEFAULT 0,
      variant_b_opens INTEGER NOT NULL DEFAULT 0,
      variant_a_fails INTEGER NOT NULL DEFAULT 0,
      variant_b_fails INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ab_test_campaign ON ab_tests(campaign_id);

    -- ═══ Contact Tags Tables ═══

    CREATE TABLE IF NOT EXISTS contact_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_tag_members (
      tag_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      PRIMARY KEY (tag_id, contact_id),
      FOREIGN KEY (tag_id) REFERENCES contact_tags(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `);
  } catch (e: any) {
    console.error('[DB] Main schema init error:', e.message);
  }

  // contact_tags tables moved to main exec block above

  // Migration: add new columns if missing
  try {
  const campaignCols = db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[];
  if (!campaignCols.some(c => c.name === 'reply_to')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN reply_to TEXT`);
  }
  if (!campaignCols.some(c => c.name === 'subject_rotation')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN subject_rotation TEXT`);
  }
  if (!campaignCols.some(c => c.name === 'enable_tracking')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN enable_tracking INTEGER NOT NULL DEFAULT 1`);
  }
  if (!campaignCols.some(c => c.name === 'enable_unsubscribe')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN enable_unsubscribe INTEGER NOT NULL DEFAULT 1`);
  }
  if (!campaignCols.some(c => c.name === 'unsubscribe_count')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN unsubscribe_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!campaignCols.some(c => c.name === 'template_rotation')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN template_rotation TEXT`);
  }
  } catch (e: any) {
    console.error("[DB] Migration error:", e.message);
  }

  try {
  const logCols = db.prepare("PRAGMA table_info(email_logs)").all() as { name: string }[];
  if (!logCols.some(c => c.name === 'subject_used')) {
    db.exec(`ALTER TABLE email_logs ADD COLUMN subject_used TEXT`);
  }
  } catch (e: any) {
    console.error("[DB] email_logs migration error:", e.message);
  }
}

// ─── Settings helpers ────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ─── Unsubscribe helpers ─────────────────────────────────────────

export function isEmailUnsubscribed(email: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT id FROM unsubscribes WHERE email = ?').get(email);
  return !!row;
}

export function addUnsubscribe(email: string, campaignId?: string, ip?: string, userAgent?: string): void {
  const db = getDb();
  try {
    db.prepare(
      'INSERT OR IGNORE INTO unsubscribes (email, campaign_id, ip_address, user_agent) VALUES (?, ?, ?, ?)'
    ).run(email, campaignId || null, ip || null, userAgent || null);

    // Increment unsubscribe count on campaign if provided
    if (campaignId) {
      db.prepare(
        'UPDATE campaigns SET unsubscribe_count = unsubscribe_count + 1 WHERE id = ?'
      ).run(campaignId);
    }
  } catch {
    // Silently handle duplicates
  }
}

export function isUnsubscribed(email: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT id FROM unsubscribes WHERE email = ?').get(email);
  return !!row;
}
