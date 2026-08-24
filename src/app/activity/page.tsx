"use client";

import { useEffect, useState } from "react";

interface Activity {
  scheduler: { running: boolean; paused: boolean; online: boolean; isProcessing: boolean };
  sending: any[];
  verifying: any[];
  scraping: any[];
  recentCompleted: any[];
  activeCount: number;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
      <div className="progress-bar" style={{ flex: 1, height: "6px" }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: "0.7rem", color: "var(--muted)", minWidth: "40px", textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "running" || status === "sending"
    ? "#10b981"
    : status === "paused"
    ? "#f59e0b"
    : status === "failed"
    ? "#ef4444"
    : "#64748b";
  return (
    <span style={{
      width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block",
      boxShadow: status === "running" || status === "sending" ? `0 0 6px ${color}` : "none",
      animation: status === "running" || status === "sending" ? "pulse-soft 2s infinite" : "none",
    }} />
  );
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch("/api/activity")
        .then(r => r.json())
        .then(data => { setActivity(data); setLoading(false); })
        .catch(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Activity</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
          Real-time view of all running operations
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
      ) : !activity ? (
        <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Failed to load activity</p>
      ) : (
        <>
          {/* ─── Status Summary ──────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <StatusDot status={activity.scheduler.running ? (activity.scheduler.paused ? "paused" : "running") : "stopped"} />
                <span style={{ fontSize: "1rem", fontWeight: 700 }}>{activity.scheduler.running ? (activity.scheduler.paused ? "Paused" : "Running") : "Stopped"}</span>
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Scheduler</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: activity.sending.length > 0 ? "var(--success)" : "var(--muted)" }}>
                {activity.sending.length}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Sending</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: activity.verifying.length > 0 ? "var(--accent)" : "var(--muted)" }}>
                {activity.verifying.length}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Verifying</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: activity.scraping.length > 0 ? "var(--warning)" : "var(--muted)" }}>
                {activity.scraping.length}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Scraping</div>
            </div>
          </div>

          {/* ─── No Activity ─────────────────────────────────── */}
          {activity.activeCount === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>😴</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.25rem" }}>No Active Operations</div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                Start a campaign, verification, or scrape job to see live activity here.
              </div>
            </div>
          )}

          {/* ─── Sending Campaigns ───────────────────────────── */}
          {activity.sending.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                📤 Sending Campaigns
                <span style={{ fontSize: "0.7rem", padding: "0.125rem 0.5rem", borderRadius: "0.75rem", background: "var(--success-light)", color: "var(--success)", fontWeight: 600 }}>
                  {activity.sending.length}
                </span>
              </h2>
              {activity.sending.map((c: any) => (
                <div key={c.id} className="card" style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {c.template_name} → {c.list_name} • Started {c.sent_at ? new Date(c.sent_at).toLocaleTimeString() : "—"}
                      </div>
                    </div>
                    <span className={`badge badge-${c.status}`}>{c.status}</span>
                  </div>
                  <ProgressBar current={c.sent_count + c.failed_count} total={c.total_count} />
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.75rem" }}>
                    <span style={{ color: "var(--success)" }}>✅ {c.sent_count} sent</span>
                    <span style={{ color: "var(--danger)" }}>❌ {c.failed_count} failed</span>
                    <span style={{ color: "var(--muted)" }}>📧 {c.total_count - c.sent_count - c.failed_count} remaining</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Verification Jobs ───────────────────────────── */}
          {activity.verifying.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                🔍 Verification Jobs
                <span style={{ fontSize: "0.7rem", padding: "0.125rem 0.5rem", borderRadius: "0.75rem", background: "rgba(99, 102, 241, 0.1)", color: "var(--accent)", fontWeight: 600 }}>
                  {activity.verifying.length}
                </span>
              </h2>
              {activity.verifying.map((j: any) => (
                <div key={j.id} className="card" style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Job {j.id.slice(0, 8)}…</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        Mode: {j.mode} • Started {new Date(j.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className={`badge badge-${j.status === "running" ? "sending" : j.status}`}>{j.status}</span>
                  </div>
                  <ProgressBar current={j.processed_count} total={j.total_count} />
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.75rem" }}>
                    <span style={{ color: "var(--success)" }}>✅ {j.valid_count} valid</span>
                    <span style={{ color: "var(--danger)" }}>❌ {j.invalid_count} invalid</span>
                    <span style={{ color: "var(--warning)" }}>⚠️ {j.risky_count} risky</span>
                    <span style={{ color: "var(--muted)" }}>{j.processed_count}/{j.total_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Scrape Jobs ─────────────────────────────────── */}
          {activity.scraping.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                🕷️ Scrape Jobs
                <span style={{ fontSize: "0.7rem", padding: "0.125rem 0.5rem", borderRadius: "0.75rem", background: "var(--warning-light)", color: "var(--warning)", fontWeight: 600 }}>
                  {activity.scraping.length}
                </span>
              </h2>
              {activity.scraping.map((j: any) => (
                <div key={j.id} className="card" style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>"{j.query}"</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        Mode: {j.mode} • Started {new Date(j.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className={`badge badge-${j.status === "running" ? "sending" : j.status}`}>{j.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem" }}>
                    <span>📄 {j.total_pages_scraped} pages</span>
                    <span>📧 {j.total_emails_found} emails found</span>
                    <span> unique {j.unique_emails}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Recent Completed ────────────────────────────── */}
          {activity.recentCompleted.length > 0 && (
            <div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                ✅ Recently Completed
              </h2>
              {activity.recentCompleted.map((j: any, i: number) => (
                <div key={`${j.type}-${j.id}-${i}`} className="card" style={{
                  marginBottom: "0.5rem", padding: "0.75rem 1rem",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.9rem" }}>{j.type === "verify" ? "🔍" : "🕷️"}</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                      {j.type === "verify" ? `Verified ${j.total} emails` : `Scraped "${j.detail}"`}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className={`badge badge-${j.status}`}>{j.status}</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                      {j.completed_at ? new Date(j.completed_at).toLocaleTimeString() : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
