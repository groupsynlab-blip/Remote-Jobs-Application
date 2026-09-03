export interface Contact {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface ContactList {
  id: string;
  name: string;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  template_id: string;
  contact_list_id: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'paused';
  scheduled_at: string | null;
  delay_seconds: number;
  reply_to: string | null;
  subject_rotation: string | null; // JSON array of subject strings
  enable_tracking: number; // 1 = open tracking on, 0 = off
  enable_unsubscribe: number; // 1 = unsubscribe link included, 0 = off
  total_count: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  unsubscribe_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface EmailLog {
  id: string;
  tracking_id: string | null;
  campaign_id: string;
  contact_id: string;
  contact_email: string;
  contact_name: string;
  status: 'queued' | 'sent' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  smtp_config_id: string | null;
  subject_used: string | null;
  open_count?: number;
  first_opened_at?: string | null;
  created_at: string;
}

export interface EmailOpen {
  id: number;
  tracking_id: string;
  opened_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

export interface SmtpConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: number;
  user: string;
  pass: string;
  from_name: string;
  from_email: string;
  enabled: number;
  daily_limit: number;
  hourly_limit: number;
  emails_sent: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmtpRateUsage {
  hourly_used: number;
  daily_used: number;
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  opened: number;
}

// ─── Email Verifier Types ──────────────────────────────────────

export type VerificationMode = 'quick' | 'thorough';
export type VerificationStatus = 'pending' | 'running' | 'completed' | 'cancelled';
export type EmailVerificationStatus = 'pending' | 'valid' | 'invalid' | 'risky' | 'error';

export interface VerificationJob {
  id: string;
  mode: VerificationMode;
  status: VerificationStatus;
  total_count: number;
  processed_count: number;
  valid_count: number;
  invalid_count: number;
  risky_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface VerificationResult {
  id: number;
  job_id: string;
  email: string;
  status: EmailVerificationStatus;
  syntax_valid: number;        // 0 or 1
  mx_valid: number;            // 0 or 1
  smtp_valid: number | null;   // null = not checked, 0 or 1
  is_disposable: number;       // 0 or 1
  is_role_account: number;     // 0 or 1
  is_catch_all: number | null; // null = not checked, 0 or 1
  error_message: string | null;
  created_at: string;
}

// ─── Email Scraper Types ───────────────────────────────────────

export type ScrapeMode = 'search' | 'crawl';
export type ScrapeJobStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export type SearchEngine = 'duckduckgo' | 'bing' | 'brave' | 'google' | 'startpage';

export interface ScrapeJob {
  id: string;
  mode: ScrapeMode;
  status: ScrapeJobStatus;
  query: string;                    // search keywords or comma-separated URLs
  search_engines: string | null;    // JSON array of engines used (search mode)
  max_results: number;              // max results per engine
  crawl_depth: number;              // how deep to crawl links (crawl mode)
  time_frame: string | null;        // date range filter
  total_pages_scraped: number;
  total_emails_found: number;
  unique_emails: number;
  created_at: string;
  completed_at: string | null;
}

export interface ScrapeResult {
  id: number;
  job_id: string;
  email: string;
  source_url: string;               // page where email was found
  page_title: string | null;
  domain: string;
  search_engine: string | null;     // which engine found it (search mode)
  created_at: string;
}
