"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { suggestCorrections, batchSuggestCorrections } from "@/lib/email-autocomplete";

// ═══ Types ══════════════════════════════════════════════════════════

interface JobStatus {
  id: string;
  mode: string;
  status: string;
  total_count: number;
  processed_count: number;
  valid_count: number;
  invalid_count: number;
  risky_count: number;
  created_at: string;
  completed_at: string | null;
}

interface VerificationRow {
  id: number;
  email: string;
  status: string;
  syntax_valid: number;
  mx_valid: number;
  smtp_valid: number | null;
  is_disposable: number;
  is_role_account: number;
  is_catch_all: number | null;
  error_message: string | null;
}

interface AutocompleteSuggestion {
  original: string;
  corrected: string;
  type: string;
  confidence: string;
  reason: string;
}

type InputTab = "paste" | "upload";
type ResultFilter = "all" | "valid" | "invalid" | "risky";

// ═══ Main Component ═════════════════════════════════════════════════

export default function VerifyPage() {
  // Input state
  const [inputTab, setInputTab] = useState<InputTab>("paste");
  const [pasteText, setPasteText] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [mode, setMode] = useState<"quick" | "thorough">("quick");

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{ emails: string[]; count: number; duplicatesRemoved: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [results, setResults] = useState<VerificationRow[]>([]);
  const [resultPage, setResultPage] = useState(0);
  const [resultTotal, setResultTotal] = useState(0);
  const RESULTS_PER_PAGE = 50;

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [acceptedCorrections, setAcceptedCorrections] = useState<Map<string, string>>(new Map());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionSummary, setSuggestionSummary] = useState<{ total: number; fixable: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Polling
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Auto-reconnect to active/completed job on page load ───────
  useEffect(() => {
    const reconnect = async () => {
      try {
        const res = await fetch("/api/verify");
        if (!res.ok) return;
        const data = await res.json();
        if (data.job) {
          setJobId(data.job.id);
          setJob(data.job);
        }
      } catch {}
    };
    reconnect();
  }, []);

  // ─── Parse emails from paste ────────────────────────────────────

  const parsePastedEmails = useCallback(() => {
    const lines = pasteText
      .split(/[\r\n]+/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0 && l.includes("@") && !l.startsWith("#"));
    const unique = [...new Set(lines)];
    setEmails(unique);
  }, [pasteText]);

  // ─── Client-side autocomplete analysis ──────────────────────────

  const analyzeEmails = useCallback((emailList: string[]) => {
    if (emailList.length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionSummary(null);
      setServerCorrections([]);
      return;
    }

    const result = batchSuggestCorrections(emailList);
    setSuggestions(result.suggestions);
    setSuggestionSummary(result.summary);

    if (result.suggestions.length > 0) {
      setShowSuggestions(true);
      // Auto-accept all high-confidence suggestions
      const autoAccept = new Map<string, string>();
      for (const s of result.suggestions) {
        if (s.confidence === "high") {
          autoAccept.set(s.original, s.corrected);
        }
      }
      setAcceptedCorrections(autoAccept);
    } else {
      setShowSuggestions(false);
    }
  }, []);

  // ─── Auto-analyze when emails change ────────────────────────────
  useEffect(() => {
    if (emails.length > 0) {
      analyzeEmails(emails);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionSummary(null);
    }
  }, [emails, analyzeEmails]);

  // ─── File upload ────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt") && !file.name.endsWith(".tsv")) {
      setError("Only .csv, .txt, and .tsv files are supported");
      return;
    }
    setUploadFile(file);
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/verify/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      setUploadPreview(data);
      setEmails(data.emails);
      // analyzeEmails runs automatically via useEffect when emails change
    } catch (err: any) {
      setError(err.message);
      setUploadFile(null);
      setUploadPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ─── Toggle a correction suggestion ───────────────────────────

  const toggleCorrection = (original: string, corrected: string) => {
    setAcceptedCorrections(prev => {
      const next = new Map(prev);
      if (next.has(original)) {
        next.delete(original);
      } else {
        next.set(original, corrected);
      }
      return next;
    });
  };

  // ─── Apply all accepted corrections ─────────────────────────────

  const applyCorrections = () => {
    const correctedEmails = emails.map(e => acceptedCorrections.get(e) || e);
    setEmails([...new Set(correctedEmails)]);
    setShowSuggestions(false);
  };

  // ─── Skip corrections ───────────────────────────────────────────

  const skipCorrections = () => {
    setShowSuggestions(false);
  };

  // ─── Start verification ─────────────────────────────────────────

  const startVerification = async () => {
    if (emails.length === 0) {
      setError("No emails to verify");
      return;
    }

    // If there are pending suggestions, block and show message
    if (showSuggestions && suggestions.length > 0) {
      setError("⚠️ Please review the autocomplete suggestions above before verifying. Click '✅ Apply Fixes' or '⏭️ Skip All' first.");
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, mode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start verification");
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

  const cancelVerification = async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/verify?jobId=${jobId}`, { method: "DELETE" });
    } catch {}
  };

  // ─── Poll job status ────────────────────────────────────────────

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/verify?jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.job);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  // ─── Fetch results ──────────────────────────────────────────────

  const fetchResults = useCallback(async () => {
    if (!jobId) return;

    try {
      const listParam = resultFilter === "all" ? "" : `&list=${resultFilter}`;
      const pageParam = `&page=${resultPage}&limit=${RESULTS_PER_PAGE}`;
      const res = await fetch(`/api/verify/results?jobId=${jobId}${listParam}${pageParam}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setResultTotal(data.total || 0);
      }
    } catch {}
  }, [jobId, resultFilter, resultPage]);

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
  const isComplete = job?.status === "completed" || job?.status === "cancelled" || job?.status === "failed";
  const progress = job ? (job.total_count > 0 ? (job.processed_count / job.total_count) * 100 : 0) : 0;
  const totalPages = Math.ceil(resultTotal / RESULTS_PER_PAGE);

  // ─── Reset for new job ──────────────────────────────────────────

  const resetForNewJob = () => {
    setJobId(null);
    setJob(null);
    setEmails([]);
    setPasteText("");
    setUploadFile(null);
    setUploadPreview(null);
    setResultFilter("all");
    setResults([]);
    setResultTotal(0);
    setResultPage(0);
    setError(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ═══ Render ═══════════════════════════════════════════════════════

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>🔍 Email Verifier</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
          Verify emails for validity — syntax, MX records, disposable, role accounts, and SMTP checks
        </p>
      </div>

      {/* ─── Input Section (only when no active job) ──────────── */}
      {!jobId && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          {/* Input Tab Toggle */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <button
              className={`btn ${inputTab === "paste" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setInputTab("paste")}
            >
              📋 Paste Emails
            </button>
            <button
              className={`btn ${inputTab === "upload" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setInputTab("upload")}
            >
              📁 Upload File
            </button>
          </div>

          {/* Paste Tab */}
          {inputTab === "paste" && (
            <div>
              <textarea
                className="input"
                placeholder={"Enter emails, one per line:\njohn@example.com\njane@gmail.com\nsupport@company.org"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onBlur={parsePastedEmails}
                style={{ minHeight: "200px", fontFamily: "monospace", fontSize: "0.875rem" }}
              />
              {pasteText && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                  {emails.length} unique email{emails.length !== 1 ? "s" : ""} detected
                </p>
              )}
              {analyzing && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600 }}>
                  🔍 Analyzing emails for typos and formatting issues...
                </p>
              )}
            </div>
          )}

          {/* Upload Tab */}
          {inputTab === "upload" && (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? "var(--accent)" : "var(--card-border)"}`,
                  borderRadius: "0.75rem",
                  padding: "3rem 2rem",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragActive ? "rgba(79, 70, 229, 0.04)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📂</div>
                <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                  {uploading ? "Uploading..." : "Drop CSV/TXT file here or click to browse"}
                </p>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Supports .csv, .txt, .tsv files up to 50MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />

              {/* Upload Preview */}
              {uploadPreview && (
                <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8fafc", borderRadius: "0.5rem" }}>
                  <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>📄 {uploadFile?.name}</p>
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    {uploadPreview.count.toLocaleString()} unique emails found
                    {uploadPreview.duplicatesRemoved > 0 && (
                      <> ({uploadPreview.duplicatesRemoved.toLocaleString()} duplicates removed)</>
                    )}
                  </p>
                  <div style={{ marginTop: "0.5rem", fontFamily: "monospace", fontSize: "0.8rem", color: "var(--muted)" }}>
                    {uploadPreview.emails.slice(0, 5).map((e: string, i: number) => (
                      <div key={i}>{e}</div>
                    ))}
                    {uploadPreview.emails.length > 5 && <div>... and {uploadPreview.count - 5} more</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode Selection */}
          <div style={{ marginTop: "1.5rem" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.875rem" }}>Verification Mode</p>
            <div style={{ display: "flex", gap: "1rem" }}>
              <label
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "1rem",
                  border: `2px solid ${mode === "quick" ? "var(--accent)" : "var(--card-border)"}`,
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  background: mode === "quick" ? "rgba(79, 70, 229, 0.04)" : "transparent",
                  transition: "all 0.15s",
                }}
                onClick={() => setMode("quick")}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "quick"}
                  onChange={() => setMode("quick")}
                  style={{ marginTop: "0.25rem" }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>⚡ Quick Mode</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    Syntax + MX records + Disposable detection. Fast processing (~5-10 min for 100K emails)
                  </div>
                </div>
              </label>
              <label
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "1rem",
                  border: `2px solid ${mode === "thorough" ? "var(--accent)" : "var(--card-border)"}`,
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  background: mode === "thorough" ? "rgba(79, 70, 229, 0.04)" : "transparent",
                  transition: "all 0.15s",
                }}
                onClick={() => setMode("thorough")}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "thorough"}
                  onChange={() => setMode("thorough")}
                  style={{ marginTop: "0.25rem" }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>🔍 Thorough Mode</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    All checks + SMTP mailbox verification + Catch-all detection. More accurate but slower (~4-8 hrs for 100K)
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* ─── Server-side Corrections Info ──────────────────── */}
          {/* (Auto-fixes are applied server-side, shown after verification starts) */}

          {/* ─── Autocomplete Suggestions Panel ───────────────── */}
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              background: "linear-gradient(135deg, #eff6ff, #f0fdf4)",
              borderRadius: "0.75rem",
              border: "2px solid #93c5fd",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>🔧 Email Autocomplete Suggestions</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>
                    Found {suggestions.length} potential fix{suggestions.length !== 1 ? "es" : ""} — {acceptedCorrections.size} auto-accepted (high confidence)
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn btn-primary"
                    onClick={applyCorrections}
                    style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}
                  >
                    ✅ Apply {acceptedCorrections.size} Fix{acceptedCorrections.size !== 1 ? "es" : ""}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={skipCorrections}
                    style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}
                  >
                    ⏭️ Skip All
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => toggleCorrection(s.original, s.corrected)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.625rem 0.75rem",
                      marginBottom: "0.375rem",
                      background: acceptedCorrections.has(s.original) ? "#dcfce7" : "white",
                      border: `1px solid ${acceptedCorrections.has(s.original) ? "#86efac" : "#e2e8f0"}`,
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={acceptedCorrections.has(s.original)}
                      readOnly
                      style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                        <span style={{ fontFamily: "monospace", color: "var(--danger)", textDecoration: "line-through" }}>
                          {s.original}
                        </span>
                        <span>→</span>
                        <span style={{ fontFamily: "monospace", color: "var(--success)", fontWeight: 600 }}>
                          {s.corrected}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                        {s.reason}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "1rem",
                        fontWeight: 600,
                        background: s.confidence === "high" ? "#dcfce7" : s.confidence === "medium" ? "#fefce8" : "#fee2e2",
                        color: s.confidence === "high" ? "#166534" : s.confidence === "medium" ? "#854d0e" : "#991b1b",
                      }}
                    >
                      {s.confidence}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: "1rem", padding: "0.75rem", background: error.includes("⚠️") ? "#fefce8" : "#fee2e2", color: error.includes("⚠️") ? "#854d0e" : "var(--danger)", borderRadius: "0.5rem", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          {/* Start Button */}
          <button
            className="btn btn-primary"
            style={{ marginTop: "1.5rem", padding: "0.75rem 2rem", fontSize: "1rem" }}
            onClick={startVerification}
            disabled={starting || emails.length === 0}
          >
            {starting ? "⏳ Starting..." : analyzing ? "🔍 Analyzing..." : `🔍 Verify ${emails.length.toLocaleString()} Emails (${mode === "quick" ? "Quick" : "Thorough"})`}
          </button>
        </div>
      )}

      {/* ─── Active Job Section ────────────────────────────────── */}
      {job && (
        <>
          {/* Progress Card */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                  {isRunning ? "🔄 Verification in Progress" : isComplete ? "✅ Verification Complete" : "⏳ Starting..."}
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Mode: {job.mode === "quick" ? "⚡ Quick" : "🔍 Thorough"} • Job ID: {job.id.slice(0, 8)}...
                </p>
              </div>
              {isRunning && (
                <button className="btn btn-danger" onClick={cancelVerification}>
                  🛑 Cancel
                </button>
              )}
              {isComplete && (
                <button className="btn btn-secondary" onClick={resetForNewJob}>
                  🔄 Verify More
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                <span>{job.processed_count.toLocaleString()} / {job.total_count.toLocaleString()} processed</span>
                <span style={{ fontWeight: 600 }}>{progress.toFixed(1)}%</span>
              </div>
              <div className="progress-bar" style={{ height: "0.75rem" }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${progress}%`,
                    background: isRunning
                      ? "linear-gradient(90deg, var(--accent), #818cf8)"
                      : job.status === "completed" ? "var(--success)" : "var(--danger)",
                  }}
                />
              </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
              <div style={{ padding: "1rem", background: "#f0fdf4", borderRadius: "0.5rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>{job.valid_count.toLocaleString()}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>✅ Valid</div>
              </div>
              <div style={{ padding: "1rem", background: "#fef2f2", borderRadius: "0.5rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--danger)" }}>{job.invalid_count.toLocaleString()}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>❌ Invalid</div>
              </div>
              <div style={{ padding: "1rem", background: "#fefce8", borderRadius: "0.5rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--warning)" }}>{job.risky_count.toLocaleString()}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>⚠️ Risky</div>
              </div>
              <div style={{ padding: "1rem", background: "#f1f5f9", borderRadius: "0.5rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--muted)" }}>
                  {(job.total_count - job.processed_count).toLocaleString()}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>⏳ Remaining</div>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Results</h2>

              {/* Export Buttons */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <a className="btn btn-secondary" href={`/api/verify/export?jobId=${jobId}&list=valid`} download>
                  ⬇️ Valid CSV
                </a>
                <a className="btn btn-secondary" href={`/api/verify/export?jobId=${jobId}&list=invalid`} download>
                  ⬇️ Invalid CSV
                </a>
                <a className="btn btn-secondary" href={`/api/verify/export?jobId=${jobId}&list=risky`} download>
                  ⬇️ Risky CSV
                </a>
                <a className="btn btn-secondary" href={`/api/verify/export?jobId=${jobId}&list=all`} download>
                  ⬇️ All CSV
                </a>
              </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              {(["all", "valid", "invalid", "risky"] as ResultFilter[]).map((filter) => {
                const count = filter === "all" ? job.total_count
                  : filter === "valid" ? job.valid_count
                  : filter === "invalid" ? job.invalid_count
                  : job.risky_count;
                return (
                  <button
                    key={filter}
                    className={`btn ${resultFilter === filter ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => { setResultFilter(filter); setResultPage(0); }}
                  >
                    {filter === "all" ? "All" : filter === "valid" ? "✅ Valid" : filter === "invalid" ? "❌ Invalid" : "⚠️ Risky"}
                    {" "}({count.toLocaleString()})
                  </button>
                );
              })}
            </div>

            {/* Results Table */}
            {results.length === 0 ? (
              <p style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
                {isRunning ? "Results will appear here as they are processed..." : "No results yet"}
              </p>
            ) : (
              <>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Syntax</th>
                        <th>MX</th>
                        {job.mode === "thorough" && <th>SMTP</th>}
                        <th>Disposable</th>
                        <th>Role</th>
                        {job.mode === "thorough" && <th>Catch-All</th>}
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{r.email}</td>
                          <td>
                            <span className={`badge badge-${r.status === "valid" ? "sent" : r.status === "invalid" ? "failed" : r.status === "risky" ? "scheduled" : "queued"}`}>
                              {r.status === "valid" ? "✅ Valid" : r.status === "invalid" ? "❌ Invalid" : r.status === "risky" ? "⚠️ Risky" : "🔄 Error"}
                            </span>
                          </td>
                          <td>{r.syntax_valid ? "✅" : "❌"}</td>
                          <td>{r.mx_valid ? "✅" : "❌"}</td>
                          {job.mode === "thorough" && (
                            <td>{r.smtp_valid === null ? "—" : r.smtp_valid ? "✅" : "❌"}</td>
                          )}
                          <td>{r.is_disposable ? "⚠️ Yes" : "No"}</td>
                          <td>{r.is_role_account ? "⚠️ Yes" : "No"}</td>
                          {job.mode === "thorough" && (
                            <td>{r.is_catch_all === null ? "—" : r.is_catch_all ? "⚠️ Yes" : "No"}</td>
                          )}
                          <td style={{ fontSize: "0.75rem", color: "var(--muted)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.error_message || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
                    <button
                      className="btn btn-secondary"
                      disabled={resultPage === 0}
                      onClick={() => setResultPage((p) => Math.max(0, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                      Page {resultPage + 1} of {totalPages}
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
