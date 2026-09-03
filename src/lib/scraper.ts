import { URL } from 'url';
import { getDb } from './db';
import type { ScrapeMode, SearchEngine, ScrapeJob } from './types';

// ═══ Constants ════════════════════════════════════════════════════════

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-!#$&'?=^`{|}~]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.tar',
  '.gz', '.rar', '.7z', '.exe', '.dmg', '.apk', '.mp3', '.mp4', '.avi',
  '.css', '.js', '.json', '.xml', '.woff', '.woff2', '.ttf', '.eot',
]);

const IGNORED_DOMAINS = new Set([
  'example.com', 'localhost', 'w3.org', 'schema.org', 'googleapis.com',
  'gstatic.com', 'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'google.com', 'apple.com', 'microsoft.com', 'mozilla.org',
]);

// ═══ HTTP Fetching (using Node.js built-in fetch) ═══════════════════

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchUrl(
  url: string,
  options: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  } = {}
): Promise<{ status: number; body: string; finalUrl: string }> {
  const { timeoutMs = 15000, headers = {}, method = 'GET', body } = options;
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const resp = await fetch(url, {
      method,
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        ...headers,
      },
      body,
      signal: controller.signal,
      redirect: 'follow',
    });
    
    const text = await resp.text();
    return { status: resp.status, body: text, finalUrl: resp.url || url };
  } finally {
    clearTimeout(timer);
  }
}

// ═══ Email Extraction ════════════════════════════════════════════════

export function extractEmails(html: string): string[] {
  // Remove script and style tags first
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/mailto:/gi, ' ');

  const rawEmails = cleaned.match(EMAIL_REGEX) || [];

  // Clean and deduplicate
  const emails = new Set<string>();
  for (const raw of rawEmails) {
    const email = raw.toLowerCase().trim()
      .replace(/^[.]+|[.]+$/g, '')  // trim leading/trailing dots
      .replace(/\?.*$/g, '');        // strip query params

    if (email.length < 5 || email.length > 254) continue;
    if (email.includes('..')) continue;
    // Skip false positives: URLs, social handles, etc.
    const localPart = email.split('@')[0];
    if (localPart.includes('/') || localPart.includes('www.')) continue;

    const domain = email.split('@')[1];
    if (!domain || IGNORED_DOMAINS.has(domain)) continue;
    if (IGNORED_EXTENSIONS.has(domain.split('.').pop() ? `.${domain.split('.').pop()}` : '')) continue;

    emails.add(email);
  }

  return [...emails];
}

export function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim().substring(0, 200) : null;
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  let baseParsed: URL;
  try {
    baseParsed = new URL(baseUrl);
  } catch {
    return [];
  }
  const linkRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

    try {
      const resolved = new URL(href, baseUrl);
      // Only follow same-domain links
      if (resolved.hostname === baseParsed.hostname) {
        const cleanUrl = resolved.origin + resolved.pathname;
        links.add(cleanUrl);
      }
    } catch {}
  }

  return [...links];
}

// ═══ Generic link extraction from search result HTML ════════════════

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

/**
 * Generic extraction: pull all external <a href="..."> links from HTML,
 * with title text from the anchor tag.
 */
function extractSearchLinks(html: string, excludeDomains: string[], max: number): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  // Match <a> tags with href containing http(s)
  const regex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null && results.length < max) {
    let url = match[1];
    const titleRaw = match[2].replace(/<[^>]+>/g, '').trim();
    const title = titleRaw.substring(0, 200);

    // Skip search engine internal links
    if (excludeDomains.some(d => url.includes(d))) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    results.push({ url, title, snippet: '' });
  }

  return results;
}

// ═══ Search Engine: DuckDuckGo (HTML lite with cookie flow) ═════════

async function searchDuckDuckGo(query: string, maxResults: number, _country?: string, _dateFrom?: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  try {
    // DuckDuckGo Lite doesn't have native pagination, but we can try multiple variations
    const queries = [query];
    // Add regional suffix if country specified
    if (_country && _country !== 'us') {
      queries.push(`${query} site:${_country === 'uk' ? 'co.uk' : _country === 'ng' ? 'com.ng' : _country === 'za' ? 'co.za' : _country === 'in' ? 'co.in' : _country === 'ca' ? 'ca' : _country === 'au' ? 'com.au' : _country}`);
    }

    for (const q of queries) {
      if (results.length >= maxResults) break;

      const searchQuery = encodeURIComponent(q);
      const cookieHeader = (await fetch(`https://html.duckduckgo.com/html/`, {
        method: 'GET',
        headers: { 'User-Agent': getRandomUA() },
        redirect: 'manual',
      }).then(r => r.headers.getSetCookie?.() || [])).join('; ');

      const formData = `q=${searchQuery}&b=&kl=${_dateFrom ? '&df=' + _dateFrom : ''}`;
      const { body } = await fetchUrl(`https://html.duckduckgo.com/html/`, {
        method: 'POST',
        timeoutMs: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://html.duckduckgo.com/html/',
          ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
        },
        body: formData,
      });

      const resultRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = resultRegex.exec(body)) !== null && results.length < maxResults) {
        let url = match[1];
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
        if (url.startsWith('http') && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ url, title, snippet: '' });
        }
      }

      if (results.length === 0) {
        const fallback = extractSearchLinks(body, ['duckduckgo.com'], maxResults - results.length);
        for (const fb of fallback) {
          if (!seenUrls.has(fb.url)) { seenUrls.add(fb.url); results.push(fb); }
        }
      }

      await sleep(1000 + Math.random() * 1000);
    }

    console.log(`[Scraper] DuckDuckGo: found ${results.length} results for "${query}"`);
  } catch (err: any) {
    console.error(`[Scraper] DuckDuckGo search error: ${err.message}`);
  }

  return results;
}

// ═══ Search Engine: Bing ════════════════════════════════════════════

async function searchBing(query: string, maxResults: number, _country?: string, _dateFrom?: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  try {
    // Bing supports pagination via first=offset parameter
    const pagesNeeded = Math.ceil(maxResults / 50);
    for (let page = 0; page < Math.min(pagesNeeded, 10); page++) {
      if (results.length >= maxResults) break;
      const offset = page * 50;
      let searchQ = query;
      if (_country && _country !== 'us') {
        const cc = _country.toUpperCase();
        searchQ = `${query} cc=${cc}`;
      }
      const searchQuery = encodeURIComponent(searchQ);
      const { body } = await fetchUrl(
        `https://www.bing.com/search?q=${searchQuery}&count=50&first=${offset}${_dateFrom ? '&filters=ex1:"ez5_' + Math.floor(new Date(_dateFrom).getTime() / 1000) + '_"' : ''}`,
        {
          timeoutMs: 15000,
          headers: {
            'Referer': 'https://www.bing.com/',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }
      );

      const bingRedirectRegex = /href="https:\/\/www\.bing\.com\/ck\/a\?[^"]*(?:&amp;|&)u=a1([A-Za-z0-9+/=]+)/g;
      let match;

      while ((match = bingRedirectRegex.exec(body)) !== null && results.length < maxResults) {
        try {
          const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
          if (decoded.startsWith('http') && !seenUrls.has(decoded)) {
            seenUrls.add(decoded);
            const titleMatch = body.substring(Math.max(0, match.index - 500), match.index)
              .match(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/i);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            results.push({ url: decoded, title, snippet: '' });
          }
        } catch {}
      }

      if (results.length === 0) {
        const fallback = extractSearchLinks(body, ['bing.com', 'microsoft.com'], maxResults - results.length);
        for (const fb of fallback) {
          if (!seenUrls.has(fb.url)) { seenUrls.add(fb.url); results.push(fb); }
        }
      }

      await sleep(1500 + Math.random() * 1500);
    }

    console.log(`[Scraper] Bing: found ${results.length} results for "${query}"`);
  } catch (err: any) {
    console.error(`[Scraper] Bing search error: ${err.message}`);
  }

  return results;
}

// ═══ Search Engine: Brave ═══════════════════════════════════════════

async function searchBrave(query: string, maxResults: number, _country?: string, _dateFrom?: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  try {
    // Brave supports pagination via offset parameter
    const pagesNeeded = Math.ceil(maxResults / 20);
    for (let page = 0; page < Math.min(pagesNeeded, 15); page++) {
      if (results.length >= maxResults) break;
      const offset = page * 20;
      const searchQuery = encodeURIComponent(query);
      const countryParam = _country && _country !== 'us' ? `&country=${_country.toUpperCase()}` : '';
      const { body } = await fetchUrl(`https://search.brave.com/search?q=${searchQuery}&offset=${offset}${countryParam}${_dateFrom ? '&tf=' + _dateFrom + '..' : ''}`, {
        timeoutMs: 15000,
        headers: {
          'Referer': 'https://search.brave.com/',
        },
      });

      const resultRegex = /<a[^>]*class="[^"]*result-header[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = resultRegex.exec(body)) !== null && results.length < maxResults) {
        const url = match[1];
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        if (url.startsWith('http') && !url.includes('brave.com') && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ url, title, snippet: '' });
        }
      }

      if (results.length === 0) {
        const fallback = extractSearchLinks(body, ['brave.com'], maxResults - results.length);
        for (const fb of fallback) {
          if (!seenUrls.has(fb.url)) { seenUrls.add(fb.url); results.push(fb); }
        }
      }

      await sleep(1500 + Math.random() * 1500);
    }

    console.log(`[Scraper] Brave: found ${results.length} results for "${query}"`);
  } catch (err: any) {
    console.error(`[Scraper] Brave search error: ${err.message}`);
  }

  return results;
}

// ═══ Search Engine: Google ══════════════════════════════════════════

async function searchGoogle(query: string, maxResults: number, _country?: string, _dateFrom?: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  try {
    // Google supports pagination via start parameter
    const pagesNeeded = Math.ceil(maxResults / 10);
    for (let page = 0; page < Math.min(pagesNeeded, 15); page++) {
      if (results.length >= maxResults) break;
      const start = page * 10;
      const countryParam = _country && _country !== 'us' ? `&gl=${_country.toUpperCase()}` : '';
      const searchQuery = encodeURIComponent(query);
      const { body } = await fetchUrl(
        `https://www.google.com/search?q=${searchQuery}&num=10&start=${start}&hl=en${countryParam}${_dateFrom ? '&tbs=cdr:1,cd_min:' + new Date(_dateFrom).toLocaleDateString('en-US') + ',cd_max:' + new Date().toLocaleDateString('en-US') : ''}`,
        {
          timeoutMs: 15000,
          headers: {
            'Referer': 'https://www.google.com/',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }
      );

      const resultRegex = /href="\/url\?q=([^&"]+)/gi;
      let match;

      while ((match = resultRegex.exec(body)) !== null && results.length < maxResults) {
        const url = decodeURIComponent(match[1]);
        if (url.startsWith('http') && !url.includes('google.com') && !url.includes('googleapis.com') && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ url, title: '', snippet: '' });
        }
      }

      if (results.length === 0) {
        const fallback = extractSearchLinks(body, ['google.com', 'googleapis.com', 'gstatic.com'], maxResults - results.length);
        for (const fb of fallback) {
          if (!seenUrls.has(fb.url)) { seenUrls.add(fb.url); results.push(fb); }
        }
      }

      await sleep(2000 + Math.random() * 2000);
    }

    console.log(`[Scraper] Google: found ${results.length} results for "${query}"`);
  } catch (err: any) {
    console.error(`[Scraper] Google search error: ${err.message}`);
  }

  return results;
}

// ═══ Search Engine: Startpage ══════════════════════════════════════

async function searchStartpage(query: string, maxResults: number, _country?: string, _dateFrom?: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  try {
    const pagesNeeded = Math.ceil(maxResults / 10);
    for (let page = 0; page < Math.min(pagesNeeded, 10); page++) {
      if (results.length >= maxResults) break;
      const startPage = page + 1;
      const countryParam = _country && _country !== 'us' ? `&language=${_country}` : '';
      const searchQuery = encodeURIComponent(query);
      const { body } = await fetchUrl(
        `https://www.startpage.com/do/dsearch?query=${searchQuery}&cat=web&startat=${startPage}${countryParam}${_dateFrom ? '&after_date=' + _dateFrom : ''}`,
        {
          timeoutMs: 15000,
          headers: {
            'Referer': 'https://www.startpage.com/',
          },
        }
      );

      const resultRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = resultRegex.exec(body)) !== null && results.length < maxResults) {
        const url = match[1];
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        if (url.startsWith('http') && !url.includes('startpage.com') && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ url, title, snippet: '' });
        }
      }

      if (results.length === 0) {
        const fallback = extractSearchLinks(body, ['startpage.com'], maxResults - results.length);
        for (const fb of fallback) {
          if (!seenUrls.has(fb.url)) { seenUrls.add(fb.url); results.push(fb); }
        }
      }

      await sleep(2000 + Math.random() * 2000);
    }

    console.log(`[Scraper] Startpage: found ${results.length} results for "${query}"`);
  } catch (err: any) {
    console.error(`[Scraper] Startpage search error: ${err.message}`);
  }

  return results;
}

const SEARCH_ENGINES: Record<SearchEngine, (query: string, max: number, country?: string, dateFrom?: string) => Promise<SearchResult[]>> = {
  duckduckgo: searchDuckDuckGo,
  bing: searchBing,
  brave: searchBrave,
  google: searchGoogle,
  startpage: searchStartpage,
};

// ─── Time Frame Helpers ─────────────────────────────────────────

type TimeFrame = 'any' | 'day' | 'week' | 'month' | '3months' | '6months' | 'year' | '2years' | '3years' | '5years';

function timeFrameToDateRange(timeFrame: string | null): string | undefined {
  if (!timeFrame || timeFrame === 'any') return undefined;
  const now = new Date();
  let startDate: Date;
  switch (timeFrame as TimeFrame) {
    case 'day':      startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); break;
    case 'week':     startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case 'month':    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case '3months':  startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
    case '6months':  startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); break;
    case 'year':     startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    case '2years':   startDate = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000); break;
    case '3years':   startDate = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000); break;
    case '5years':   startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000); break;
    default:         return undefined;
  }
  return startDate.toISOString().split('T')[0];
}

// ═══ Website Crawler ════════════════════════════════════════════════

interface CrawlResult {
  url: string;
  emails: string[];
  title: string | null;
  links: string[];
}

export async function crawlPage(url: string): Promise<CrawlResult> {
  try {
    const { body, finalUrl } = await fetchUrl(url);
    const emails = extractEmails(body);
    const title = extractPageTitle(body);
    const links = extractLinks(body, finalUrl);

    return { url: finalUrl, emails, title, links };
  } catch (err: any) {
    return { url, emails: [], title: null, links: [] };
  }
}

// ═══ Background Job Processing ══════════════════════════════════════

const activeJobs = new Map<string, boolean>();

export function isScrapeJobActive(jobId: string): boolean {
  return activeJobs.get(jobId) === true;
}

export function cancelScrapeJob(jobId: string): void {
  activeJobs.set(jobId, false);
}

/** Yield to the event loop so synchronous better-sqlite3 calls don't block the server */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/** Flush a batch of email results to DB in a single transaction */
function flushResultsToDb(
  jobId: string,
  results: Array<{ email: string; url: string; title: string | null; domain: string; engine: string | null }>,
  pagesScraped: number,
  totalEmails: number
): void {
  if (results.length === 0 && pagesScraped === 0) return;
  const db = getDb();
  const insertMany = db.transaction((items: typeof results) => {
    for (const r of items) {
      db.prepare(`
        INSERT INTO scrape_results (job_id, email, source_url, page_title, domain, search_engine)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(jobId, r.email, r.url, r.title, r.domain, r.engine);
    }
    db.prepare('UPDATE scrape_jobs SET total_emails_found = ?, total_pages_scraped = ? WHERE id = ?')
      .run(totalEmails, pagesScraped, jobId);
  });
  insertMany(results);
}

/** Run async tasks with a concurrency limit */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = task().then(
      val => { results.push({ status: 'fulfilled', value: val }); },
      reason => { results.push({ status: 'rejected', reason }); }
    ).then(() => { executing.delete(p); });

    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled(executing);
  return results;
}

export async function processScrapeJob(jobId: string): Promise<void> {
  const db = getDb();
  const job = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(jobId) as ScrapeJob | undefined;
  if (!job) throw new Error('Scrape job not found');

  activeJobs.set(jobId, true);
  db.prepare("UPDATE scrape_jobs SET status = 'running' WHERE id = ?").run(jobId);

  console.log(`[Scraper] Starting job ${jobId.slice(0, 8)}... (mode: ${job.mode})`);

  try {
    if (job.mode === 'search') {
      await processSearchJob(jobId, job);
    } else {
      await processCrawlJob(jobId, job);
    }
  } catch (err: any) {
    console.error(`[Scraper] Job ${jobId.slice(0, 8)}... error: ${err.message}`);
    db.prepare("UPDATE scrape_jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?").run(jobId);
  }

  activeJobs.delete(jobId);
}

async function processSearchJob(jobId: string, job: ScrapeJob): Promise<void> {
  let engines: SearchEngine[] = ['duckduckgo', 'bing', 'brave'];
  let country: string | undefined;
  let fileType: string | undefined;

  if (job.search_engines) {
    try {
      const parsed = JSON.parse(job.search_engines);
      if (Array.isArray(parsed)) {
        engines = parsed;
      } else if (parsed && typeof parsed === 'object') {
        engines = parsed.engines || ['duckduckgo', 'bing', 'brave'];
        country = parsed.country;
        fileType = parsed.fileType;
      }
    } catch {}
  }

  const rawQueries = job.query.split('\n').map(q => q.trim()).filter(q => q.length > 0);
  const queries: string[] = [];

  // Build queries with country and file type modifiers
  for (const q of rawQueries) {
    let modifiedQuery = q;
    if (fileType) {
      modifiedQuery += ` filetype:${fileType}`;
    }
    if (country && country !== 'us') {
      // Add country-specific domain hints
      const countryDomains: Record<string, string> = {
        uk: 'site:co.uk', ng: 'site:com.ng', za: 'site:co.za',
        in: 'site:co.in', au: 'site:com.au', ca: 'site:ca',
        ke: 'site:co.ke', gh: 'site:com.gh',
      };
      const domainHint = countryDomains[country];
      if (domainHint && !modifiedQuery.toLowerCase().includes('site:')) {
        modifiedQuery += ` ${domainHint}`;
      }
    }
    queries.push(modifiedQuery);
  }

  const maxResults = job.max_results || 200;
  const dateFrom = timeFrameToDateRange(job.time_frame);

  if (dateFrom) {
    console.log(`[Scraper] Time frame filter: results from ${dateFrom} onwards`);
  }

  const allFoundEmails = new Map<string, { url: string; title: string | null; engine: string }>();
  let totalPagesScraped = 0;
  const pendingFlush: Array<{ email: string; url: string; title: string | null; domain: string; engine: string }> = [];

  for (const query of queries) {
    if (!activeJobs.get(jobId)) {
      getDb().prepare("UPDATE scrape_jobs SET status = 'cancelled' WHERE id = ?").run(jobId);
      return;
    }

    for (const engineName of engines) {
      if (!activeJobs.get(jobId)) break;

      console.log(`[Scraper] Job ${jobId.slice(0, 8)}... searching "${query}" on ${engineName}`);

      try {
        const engine = SEARCH_ENGINES[engineName];
        const searchResults = await engine(query, maxResults, country, dateFrom);
        totalPagesScraped += searchResults.length;

        // Visit each search result — up to 3 at a time to avoid blocking
        const fetchTasks = searchResults
          .filter(r => {
            try {
              const domain = new URL(r.url).hostname;
              return !IGNORED_DOMAINS.has(domain);
            } catch { return false; }
          })
          .map(result => async () => {
            if (!activeJobs.get(jobId)) return null;
            try {
              const crawlResult = await crawlPage(result.url);
              return { result, crawlResult };
            } catch {
              return null;
            }
          });

        const crawled = await runWithConcurrency(fetchTasks, 5);

        for (const item of crawled) {
          if (item.status !== 'fulfilled' || !item.value) continue;
          const { result: sr, crawlResult } = item.value;
          for (const email of crawlResult.emails) {
            if (!allFoundEmails.has(email)) {
              allFoundEmails.set(email, { url: sr.url, title: crawlResult.title || sr.title, engine: engineName });
              pendingFlush.push({
                email, url: sr.url, title: crawlResult.title || sr.title,
                domain: email.split('@')[1] || '', engine: engineName,
              });
            }
          }
        }

        // Flush results to DB periodically (every 50 emails) and yield
        if (pendingFlush.length >= 50) {
          flushResultsToDb(jobId, pendingFlush, totalPagesScraped, allFoundEmails.size);
          pendingFlush.length = 0;
          await yieldToEventLoop();
        }
      } catch (err: any) {
        console.error(`[Scraper] ${engineName} search error: ${err.message}`);
      }

      await sleep(2000 + Math.random() * 2000);
    }
  }

  // Final flush
  flushResultsToDb(jobId, pendingFlush, totalPagesScraped, allFoundEmails.size);

  const db = getDb();
  db.prepare(`
    UPDATE scrape_jobs SET
      status = 'completed',
      unique_emails = ?,
      completed_at = datetime('now')
    WHERE id = ?
  `).run(allFoundEmails.size, jobId);

  console.log(`[Scraper] Job ${jobId.slice(0, 8)}... completed: ${totalPagesScraped} pages scraped, ${allFoundEmails.size} unique emails found`);
}

async function processCrawlJob(jobId: string, job: ScrapeJob): Promise<void> {
  const startUrls = job.query.split('\n').map(q => q.trim()).filter(q => q.length > 0);
  const maxDepth = job.crawl_depth || 1;

  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = startUrls.map(url => ({ url, depth: 0 }));
  const allFoundEmails = new Set<string>();
  let totalPagesScraped = 0;
  const pendingFlush: Array<{ email: string; url: string; title: string | null; domain: string; engine: string | null }> = [];

  while (queue.length > 0) {
    if (!activeJobs.get(jobId)) {
      getDb().prepare("UPDATE scrape_jobs SET status = 'cancelled' WHERE id = ?").run(jobId);
      return;
    }

    const batch = queue.splice(0, 5); // smaller batches to avoid blocking
    const newLinks: { url: string; depth: number }[] = [];        const fetchTasks = batch.map(({ url, depth }) => async () => {
      let normalizedUrl = url;
      try {
        const parsed = new URL(url);
        normalizedUrl = parsed.origin + parsed.pathname.replace(/\/$/, '');
      } catch { return null; }

      if (visited.has(normalizedUrl)) return null;
      visited.add(normalizedUrl);

      try {
        const domain = new URL(url).hostname;
        if (IGNORED_DOMAINS.has(domain)) return null;
      } catch { return null; }

      const pathname = new URL(url).pathname.toLowerCase();
      if ([...IGNORED_EXTENSIONS].some(ext => pathname.endsWith(ext))) return null;

      const result = await crawlPage(url);

      const newEmails: Array<{ email: string; url: string; title: string | null; domain: string; engine: null }> = [];
      for (const email of result.emails) {
        if (!allFoundEmails.has(email)) {
          allFoundEmails.add(email);
          newEmails.push({ email, url, title: result.title, domain: email.split('@')[1] || '', engine: null });
        }
      }

      // Collect new links for queue
      if (depth < maxDepth) {
        for (const link of result.links) {
          if (!visited.has(link)) {
            try {
              const linkDomain = new URL(link).hostname;
              if (!IGNORED_DOMAINS.has(linkDomain)) {
                newLinks.push({ url: link, depth: depth + 1 });
              }
            } catch {}
          }
        }
      }

      return { newEmails, crawled: true };
    });

    const results = await runWithConcurrency(fetchTasks, 5);

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.crawled) {
        totalPagesScraped++;
        pendingFlush.push(...r.value.newEmails);
      }
    }

    queue.push(...newLinks);

    // Flush periodically
    if (pendingFlush.length >= 25) {
      flushResultsToDb(jobId, pendingFlush, totalPagesScraped, allFoundEmails.size);
      pendingFlush.length = 0;
      console.log(`[Scraper] Job ${jobId.slice(0, 8)}... crawled ${totalPagesScraped} pages, ${allFoundEmails.size} unique emails`);
      await yieldToEventLoop();
    }

    await sleep(500 + Math.random() * 500);
  }

  // Final flush
  flushResultsToDb(jobId, pendingFlush, totalPagesScraped, allFoundEmails.size);

  const db = getDb();
  db.prepare(`
    UPDATE scrape_jobs SET
      status = 'completed',
      total_pages_scraped = ?,
      unique_emails = ?,
      completed_at = datetime('now')
    WHERE id = ?
  `).run(totalPagesScraped, allFoundEmails.size, jobId);

  console.log(`[Scraper] Job ${jobId.slice(0, 8)}... completed: ${totalPagesScraped} pages crawled, ${allFoundEmails.size} unique emails found`);
}
