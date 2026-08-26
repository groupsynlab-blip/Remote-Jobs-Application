"use client";

import { useEffect, useState } from "react";

interface WarmupConfig {
  id: string;
  smtp_config_id: string;
  smtp_name: string;
  from_email: string;
  host: string;
  status: string;
  daily_limit: number;
  current_day: number;
  total_days: number;
  emails_sent: number;
  today_sent: number;
  total_sent: number;
  failed_count: number;
  started_at: string | null;
  created_at: string;
}

interface SmtpConfig { id: string; name: string; from_email: string; }

export default function WarmupPage() {
  const [warmups, setWarmups] = useState<WarmupConfig[]>([]);
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedSmtp, setSelectedSmtp] = useState("");
  const [dailyLimit, setDailyLimit] = useState(5);
  const [totalDays, setTotalDays] = useState(30);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetchWarmups();
    fetch("/api/smtp").then(r => r.json()).then(d => setSmtpConfigs(Array.isArray(d) ? d : d.configs || [])).catch(() => {});
  }, []);

  const fetchWarmups = () => {
    fetch("/api/warmup").then(r => r.json()).then(setWarmups);
  };

  const handleCreate = async () => {
    await fetch("/api/warmup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smtp_config_id: selectedSmtp, daily_limit: dailyLimit, total_days: totalDays }),
    });
    setShowForm(false);
    fetchWarmups();
  };

  const handleAction = async (id: string, action: string) => {
    if (action === "send-now") setSending(id);
    await fetch(`/api/warmup/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSending(null);
    fetchWarmups();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this warmup config?")) return;
    await fetch(`/api/warmup?id=${id}`, { method: "DELETE" });
    fetchWarmups();
  };

  const statusColor = (s: string) => {
    if (s === "active") return { bg: "rgba(34,197,94,0.15)", color: "#22c55e" };
    if (s === "paused") return { bg: "rgba(234,179,8,0.15)", color: "#eab308" };
    return { bg: "rgba(107,114,128,0.15)", color: "#6b7280" };
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>🔥 Email Warmup</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Build sender reputation by gradually increasing email volume
          </p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          padding: "0.75rem 1.5rem", borderRadius: "0.75rem", border: "none",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
          fontWeight: 600, cursor: "pointer", fontSize: "0.875rem",
        }}>+ New Warmup</button>
      </div>

      {/* How It Works */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "2rem", background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>📖 How Warmup Works</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", fontSize: "0.75rem", color: "var(--muted)" }}>
          <div><strong style={{ color: "var(--foreground)" }}>1. Configure</strong><br/>Select SMTP and daily limit</div>
          <div><strong style={{ color: "var(--foreground)" }}>2. Start</strong><br/>Activate the warmup schedule</div>
          <div><strong style={{ color: "var(--foreground)" }}>3. Send</strong><br/>Auto or manual warmup emails daily</div>
          <div><strong style={{ color: "var(--foreground)" }}>4. Warm</strong><br/>Reputation builds over 2-4 weeks</div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>New Warmup Configuration</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>SMTP Config</label>
              <select value={selectedSmtp} onChange={e => setSelectedSmtp(e.target.value)} className="input">
                <option value="">Select SMTP...</option>
                {smtpConfigs.map(s => (
                  <option key={s.id} value={s.id}>{s.name || s.from_email}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Daily Limit</label>
              <input type="number" value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} className="input" min={1} max={500} />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Total Days</label>
              <input type="number" value={totalDays} onChange={e => setTotalDays(Number(e.target.value))} className="input" min={7} max={90} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button onClick={handleCreate} style={{
              padding: "0.625rem 1.5rem", borderRadius: "0.5rem", border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
              fontWeight: 600, cursor: "pointer",
            }}>Create</button>
            <button onClick={() => setShowForm(false)} style={{
              padding: "0.625rem 1.5rem", borderRadius: "0.5rem",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted)", cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Warmup Cards */}
      <div style={{ display: "grid", gap: "1rem" }}>
        {warmups.map(w => {
          const sc = statusColor(w.status);
          const progress = w.total_days > 0 ? Math.min(100, (w.current_day / w.total_days) * 100) : 0;
          return (
            <div key={w.id} className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{w.smtp_name || w.from_email}</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{w.host}</p>
                </div>
                <span style={{
                  padding: "0.2rem 0.625rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600,
                  background: sc.bg, color: sc.color, textTransform: "uppercase",
                }}>{w.status}</span>
              </div>

              {/* Progress Bar */}
              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
                  <span>Day {w.current_day} / {w.total_days}</span>
                  <span>{progress.toFixed(0)}%</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--border)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", width: `${progress}%`,
                    background: "linear-gradient(90deg, #6366f1, #a855f7)",
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginTop: "1rem" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{w.today_sent}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Today</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{w.total_sent}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Total Sent</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: w.failed_count > 0 ? "#ef4444" : "inherit" }}>{w.failed_count}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Failed</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{w.daily_limit}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Daily Limit</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                {w.status === "idle" || w.status === "paused" ? (
                  <button onClick={() => handleAction(w.id, "start")} style={{
                    padding: "0.375rem 0.875rem", borderRadius: "0.375rem", border: "none",
                    background: "#22c55e", color: "#fff", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                  }}>▶ Start</button>
                ) : (
                  <button onClick={() => handleAction(w.id, "stop")} style={{
                    padding: "0.375rem 0.875rem", borderRadius: "0.375rem", border: "none",
                    background: "#eab308", color: "#fff", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                  }}>⏸ Pause</button>
                )}
                <button
                  onClick={() => handleAction(w.id, "send-now")}
                  disabled={sending === w.id || w.today_sent >= w.daily_limit}
                  style={{
                    padding: "0.375rem 0.875rem", borderRadius: "0.375rem", border: "1px solid var(--border)",
                    background: "transparent", fontSize: "0.7rem", cursor: "pointer",
                    opacity: sending === w.id || w.today_sent >= w.daily_limit ? 0.5 : 1,
                  }}
                >
                  {sending === w.id ? "⏳ Sending..." : "📧 Send Now"}
                </button>
                <button onClick={() => handleDelete(w.id)} style={{
                  padding: "0.375rem 0.875rem", borderRadius: "0.375rem", border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "0.7rem", cursor: "pointer",
                }}>🗑️</button>
              </div>
            </div>
          );
        })}
        {warmups.length === 0 && (
          <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔥</p>
            <p>No warmup configs yet. Create one to start building your sender reputation!</p>
          </div>
        )}
      </div>
    </div>
  );
}
