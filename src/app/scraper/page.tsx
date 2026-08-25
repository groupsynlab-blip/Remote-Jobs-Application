"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ═══ Types ══════════════════════════════════════════════════════════

interface ScrapeJobStatus {
  id: string;
  mode: string;
  status: string;
  query: string;
  search_engines: string | null;
  max_results: number;
  crawl_depth: number;
  total_pages_scraped: number;
  total_emails_found: number;
  unique_emails: number;
  created_at: string;
  completed_at: string | null;
}

interface ScrapeResultRow {
  id: number;
  email: string;
  source_url: string;
  page_title: string | null;
  domain: string;
  search_engine: string | null;
  created_at: string;
}

import { batchSuggestCorrections, type AutocompleteSuggestion } from "@/lib/email-autocomplete";

type ScrapeTab = "search" | "crawl";

const ENGINES = [
  { id: "duckduckgo", label: "DuckDuckGo", icon: "🦆" },
  { id: "bing", label: "Bing", icon: "🔍" },
  { id: "brave", label: "Brave", icon: "🦁" },
  { id: "google", label: "Google", icon: "🌐" },
  { id: "startpage", label: "Startpage", icon: "⚡" },
];

// ═══ Main Component ═════════════════════════════════════════════════

export default function ScraperPage() {
  // Input state
  const [scrapeTab, setScrapeTab] = useState<ScrapeTab>("search");
  const [query, setQuery] = useState("");
  const [selectedEngines, setSelectedEngines] = useState<string[]>(["duckduckgo", "bing", "brave"]);
  const [maxResults, setMaxResults] = useState(50);
  const [crawlDepth, setCrawlDepth] = useState(1);

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ScrapeJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [results, setResults] = useState<ScrapeResultRow[]>([]);
  const [resultPage, setResultPage] = useState(0);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultDomains, setResultDomains] = useState(0);
  const [emailFilter, setEmailFilter] = useState("");
  const RESULTS_PER_PAGE = 50;

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionSummary, setSuggestionSummary] = useState<{ total: number; fixable: number } | null>(null);

  // Polling
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Toggle engine ──────────────────────────────────────────────

  const toggleEngine = (engineId: string) => {
    setSelectedEngines((prev) =>
      prev.includes(engineId)
        ? prev.filter((e) => e !== engineId)
        : [...prev, engineId]
    );
  };

  // ─── Analyze scraped emails for suggestions ─────────────────────

  const analyzeScrapedEmails = useCallback((emailList: string[]) => {
    const result = batchSuggestCorrections(emailList);
    setSuggestions(result.suggestions);
    setSuggestionSummary(result.summary);
    if (result.suggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, []);

  // ─── Apply corrections to scraped results ───────────────────────

  const applyScrapedCorrections = async () => {
    if (!jobId) return;
    try {
      const corrections: Record<string, string> = {};
      for (const s of suggestions) {
        corrections[s.original] = s.corrected;
      }
      await fetch(`/api/scrape/fix-emails?jobId=${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corrections }),
      });
      // Re-fetch results
      fetchResults();
      setShowSuggestions(false);
    } catch (err) {
      console.error("Failed to apply corrections:", err);
    }
  };

  const skipScrapedCorrections = () => {
    setShowSuggestions(false);
  };

  // ─── Start scrape ───────────────────────────────────────────────

  const startScrape = async () => {
    if (!query.trim()) {
      setError("Please enter a search query or URLs");
      return;
    }
    if (scrapeTab === "search" && selectedEngines.length === 0) {
      setError("Please select at least one search engine");
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const body: any = {
        query: query.trim(),
        mode: scrapeTab,
      };
      if (scrapeTab === "search") {
        body.engines = selectedEngines;
        body.maxResults = maxResults;
      } else {
        body.crawlDepth = crawlDepth;
      }

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start scrape");
      }

      const data = await res.json();
      setJobId(data.jobId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  // ─── Cancel job ─────────────────────────────────────────────────

  const cancelScrape = async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/scrape?jobId=${jobId}`, { method: "DELETE" });
    } catch {}
  };

  // ─── Poll job status ────────────────────────────────────────────

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/scrape?jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.job);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  // ─── Fetch results ──────────────────────────────────────────────

  const fetchResults = useCallback(async () => {
    if (!jobId) return;

    try {
      const res = await fetch(
        `/api/scrape/results?jobId=${jobId}&page=${resultPage}&limit=${RESULTS_PER_PAGE}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setResultTotal(data.total || 0);
        setResultDomains(data.uniqueDomains || 0);
      }
    } catch {}
  }, [jobId, resultPage]);

  useEffect(() => {
    if (jobId) fetchResults();
  }, [jobId, fetchResults]);

  // Re-fetch results periodically while job is running
  useEffect(() => {
    if (!jobId || job?.status === "completed" || job?.status === "cancelled") return;
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, [jobId, job?.status, fetchResults]);

  // ─── Derived state ──────────────────────────────────────────────

  const isRunning = job?.status === "running" || job?.status === "pending";
  const isComplete =
    job?.status === "completed" || job?.status === "cancelled" || job?.status === "failed";
  const totalPages = Math.ceil(resultTotal / RESULTS_PER_PAGE);

  // ─── Filter results client-side ─────────────────────────────────

  const filteredResults = emailFilter
    ? results.filter(
        (r) =>
          r.email.toLowerCase().includes(emailFilter.toLowerCase()) ||
          r.domain.toLowerCase().includes(emailFilter.toLowerCase()) ||
          r.source_url.toLowerCase().includes(emailFilter.toLowerCase())
      )
    : results;

  // ─── Reset ──────────────────────────────────────────────────────

  const resetForNewJob = () => {
    setJobId(null);
    setJob(null);
    setQuery("");
    setResultFilter("all");
    setResults([]);
    setResultTotal(0);
    setResultPage(0);
    setEmailFilter("");
    setError(null);
  };

  const setResultFilter = (_f: string) => {};

  // ═══ Render ═══════════════════════════════════════════════════════

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>🕷️ Email Scraper</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
          Find email addresses from the web using search engines or by crawling websites
        </p>
      </div>

      {/* ─── Input Section ──────────────────────────────────── */}
      {!jobId && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          {/* Mode Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <button
              className={`btn ${scrapeTab === "search" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setScrapeTab("search")}
            >
              🔍 Search Engines
            </button>
            <button
              className={`btn ${scrapeTab === "crawl" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setScrapeTab("crawl")}
            >
              🌐 Website Crawler
            </button>
          </div>

          {/* Search Mode */}
          {scrapeTab === "search" && (
            <div>
              <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                Search Queries (one per line)
              </label>
              <textarea
                className="input"
                placeholder={
                  "SaaS marketing manager email\nrestaurant owner contact NYC\ndeveloper emails github.com"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "0.875rem" }}
              />
              <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                Tip: Use quotes for exact phrases, add &quot;email&quot; or &quot;contact&quot; for better results
              </p>

              {/* Search Engines */}
              <div style={{ marginTop: "1.5rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.75rem" }}>
                  Search Engines
                </label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {ENGINES.map((engine) => (
                    <button
                      key={engine.id}
                      className={`btn ${selectedEngines.includes(engine.id) ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => toggleEngine(engine.id)}
                    >
                      {engine.icon} {engine.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Results */}
              <div style={{ marginTop: "1.5rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                  Max Results Per Engine: {maxResults}
                </label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={maxResults}
                  onChange={(e) => setMaxResults(parseInt(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
                  <span>10</span>
                  <span>200</span>
                </div>
              </div>
            </div>
          )}

          {/* Crawl Mode */}
          {scrapeTab === "crawl" && (
            <div>
              <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                Website URLs (one per line)
              </label>
              <textarea
                className="input"
                placeholder={
                  "https://company.com/contact\nhttps://startup.io/about\nhttps://agency.com/team"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ minHeight: "150px", fontFamily: "monospace", fontSize: "0.875rem" }}
              />

              {/* Crawl Depth */}
              <div style={{ marginTop: "1.5rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                  Crawl Depth: {crawlDepth} {crawlDepth === 1 ? "level" : "levels"}
                </label>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="1"
                  value={crawlDepth}
                  onChange={(e) => setCrawlDepth(parseInt(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
                  <span>1 — Only the listed pages</span>
                  <span>3 — Follow links up to 3 levels deep</span>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "#fee2e2",
                color: "var(--danger)",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              ❌ {error}
            </div>
          )}

          {/* Start Button */}
          <button
            className="btn btn-primary"
            style={{ marginTop: "1.5rem", padding: "0.75rem 2rem", fontSize: "1rem" }}
            onClick={startScrape}
            disabled={starting || !query.trim()}
          >
            {starting
              ? "⏳ Starting..."
              : scrapeTab === "search"
              ? `🔍 Search & Extract Emails`
              : `🕷️ Crawl & Extract Emails`}
          </button>
        </div>
      )}

      {/* ─── Active Job Section ────────────────────────────────── */}
      {job && (
        <>
          {/* Progress Card */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                  {isRunning
                    ? "🔄 Scraping in Progress"
                    : isComplete
                    ? "✅ Scraping Complete"
                    : "⏳ Starting..."}
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Mode: {job.mode === "search" ? "🔍 Search" : "🌐 Crawl"} • Job: {job.id.slice(0, 8)}...
                </p>
              </div>
              {isRunning && (
                <button className="btn btn-danger" onClick={cancelScrape}>
                  🛑 Cancel
                </button>
              )}
              {isComplete && (
                <button className="btn btn-secondary" onClick={resetForNewJob}>
                  🔄 Scrape More
                </button>
              )}
            </div>

            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
              <div
                style={{
                  padding: "1rem",
                  background: "#eff6ff",
                  borderRadius: "0.5rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                  {job.total_pages_scraped.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>📄 Pages Scraped</div>
              </div>
              <div
                style={{
                  padding: "1rem",
                  background: "#f0fdf4",
                  borderRadius: "0.5rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>
                  {job.unique_emails.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>✉️ Unique Emails</div>
              </div>
              <div
                style={{
                  padding: "1rem",
                  background: "#fefce8",
                  borderRadius: "0.5rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--warning)" }}>
                  {resultDomains.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>🌐 Unique Domains</div>
              </div>
            </div>
          </div>

          {/* Autocomplete Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="card" style={{ marginBottom: "1.5rem", border: "2px solid #93c5fd", background: "linear-gradient(135deg, #eff6ff, #f0fdf4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>🔧 Email Autocomplete Suggestions</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>
                    Found {suggestions.length} potential fix{suggestions.length !== 1 ? "es" : ""} for {suggestionSummary?.fixable || 0} email{(suggestionSummary?.fixable || 0) !== 1 ? "s" : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn btn-primary" onClick={applyScrapedCorrections} style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
                    ✅ Apply All Fixes
                  </button>
                  <button className="btn btn-secondary" onClick={skipScrapedCorrections} style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
                    ⏭️ Skip
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                {suggestions.slice(0, 20).map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0", fontSize: "0.8rem", borderBottom: i < Math.min(suggestions.length, 20) - 1 ? "1px solid #e2e8f0" : "none" }}>
                    <span style={{ fontFamily: "monospace", color: "var(--danger)", textDecoration: "line-through" }}>{s.original}</span>
                    <span>→</span>
                    <span style={{ fontFamily: "monospace", color: "var(--success)", fontWeight: 600 }}>{s.corrected}</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>({s.reason})</span>
                  </div>
                ))}
                {suggestions.length > 20 && (
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", padding: "0.5rem", textAlign: "center" }}>
                    ... and {suggestions.length - 20} more suggestions
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Results Section */}
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Results</h2>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {/* Search Filter */}
                <input
                  className="input"
                  placeholder="Filter by email or domain..."
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  style={{ width: "250px", fontSize: "0.8rem" }}
                />

                {/* Export Button */}
                <a
                  className="btn btn-secondary"
                  href={`/api/scrape/export?jobId=${jobId}`}
                  download
                >
                  ⬇️ Export CSV
                </a>
              </div>
            </div>

            {/* Results Table */}
            {filteredResults.length === 0 ? (
              <p style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
                {isRunning
                  ? "Results will appear here as pages are scraped..."
                  : "No results yet"}
              </p>
            ) : (
              <>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Domain</th>
                        <th>Source URL</th>
                        <th>Page Title</th>
                        <th>Engine</th>
                        <th>Found</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r) => (
                        <tr key={r.id}>
                          <td
                            style={{
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                              fontWeight: 500,
                            }}
                          >
                            {r.email}
                          </td>
                          <td style={{ fontSize: "0.8rem" }}>{r.domain}</td>
                          <td
                            style={{
                              fontSize: "0.75rem",
                              maxWidth: "250px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <a href={r.source_url} target="_blank" rel="noopener noreferrer">
                              {r.source_url}
                            </a>
                          </td>
                          <td
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--muted)",
                              maxWidth: "200px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.page_title || "—"}
                          </td>
                          <td style={{ fontSize: "0.75rem" }}>
                            {r.search_engine
                              ? ENGINES.find((e) => e.id === r.search_engine)?.icon || r.search_engine
                              : "🕷️"}
                          </td>
                          <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            {new Date(r.created_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginTop: "1rem",
                    }}
                  >
                    <button
                      className="btn btn-secondary"
                      disabled={resultPage === 0}
                      onClick={() => setResultPage((p) => Math.max(0, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                      Page {resultPage + 1} of {totalPages} ({resultTotal.toLocaleString()} emails)
                    </span>
                    <button
                      className="btn btn-secondary"
                      disabled={resultPage >= totalPages - 1}
                      onClick={() => setResultPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
