"use client";

import { useEffect, useState, useCallback } from "react";

interface SmtpHealthConfig {
  id: string;
  name: string;
  from_email: string;
  host: string;
  port: number;
  enabled: number;
  daily_limit: number;
  hourly_limit: number;
  rate_usage: { hourly_used: number; daily_used: number };
  stats: { total_sent: number; total_failed: number; success_rate: string };
  last_used: string | null;
}

interface SendLog {
  contact_email: string;
  contact_name: string;
  status: string;
  subject_used: string;
  sent_at: string;
  error_message: string | null;
  campaign_name: string;
}

interface DailyBreakdown {
  day: string;
  smtp_config_id?: string;
  count: number;
  status: string;
}

export default function SmtpHealthPage() {
  const [configs, setConfigs] = useState<SmtpHealthConfig[]>([]);
  const [selectedSmtp, setSelectedSmtp] = useState<string | null>(null);
  const [sendLogs, setSendLogs] = useState<SendLog[]>([]);
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdown[]>([]);
  const [refreshTime, setRefreshTime] = useState("");
  const [daysFilter, setDaysFilter] = useState(7);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const url = selectedSmtp
        ? `/api/smtp-health?smtp_id=${selectedSmtp}&days=${daysFilter}`
        : `/api/smtp-health?days=${daysFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setConfigs(data.configs || []);
      setSendLogs(data.send_logs || []);
      setDailyBreakdown(data.daily_breakdown || []);
    } catch (err) {
      console.error("Failed to fetch SMTP health:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSmtp, daysFilter]);

  useEffect(() => {
    fetchData();
    // Calculate when daily limit resets (midnight Pacific Time)
    const now = new Date();
    const pacificOffset = -7;
    const utcHour = now.getUTCHours();
    const pacificHour = (utcHour + pacificOffset + 24) % 24;
    const minutesUntilMidnight = (24 - pacificHour - 1) * 60 + (60 - now.getUTCMinutes());
    const resetDate = new Date(now.getTime() + minutesUntilMidnight * 60000);
    setRefreshTime(resetDate.toLocaleString());

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalSentToday = configs.reduce((sum, c) => sum + (c.rate_usage?.daily_used || 0), 0);
  const totalHourlySent = configs.reduce((sum, c) => sum + (c.rate_usage?.hourly_used || 0), 0);
  const totalDailyCapacity = configs.reduce((sum, c) => sum + (c.daily_limit || 0), 0);
  const totalHourlyCapacity = configs.reduce((sum, c) => sum + (c.hourly_limit || 0), 0);
  const totalAllTimeSent = configs.reduce((sum, c) => sum + (c.stats?.total_sent || 0), 0);
  const totalAllTimeFailed = configs.reduce((sum, c) => sum + (c.stats?.total_failed || 0), 0);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Never";
    const d = new Date(dateStr + (dateStr.includes("Z") ? "" : "Z"));
    return d.toLocaleString();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "sent": return "#10b981";
      case "failed": return "#ef4444";
      case "queued": return "#f59e0b";
      case "rate_limited": return "#f97316";
      default: return "#94a3b8";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": return "✅";
      case "failed": return "❌";
      case "queued": return "⏳";
      case "rate_limited": return "⚠️";
      default: return "•";
    }
  };

  // Group daily breakdown by day for the chart
  const dailyByDay: Record<string, { sent: number; failed: number; queued: number }> = {};
  dailyBreakdown.forEach((d) => {
    if (!dailyByDay[d.day]) dailyByDay[d.day] = { sent: 0, failed: 0, queued: 0 };
    if (d.status === "sent") dailyByDay[d.day].sent += d.count;
    else if (d.status === "failed") dailyByDay[d.day].failed += d.count;
    else dailyByDay[d.day].queued += d.count;
  });
  const chartDays = Object.keys(dailyByDay).sort().slice(-daysFilter);
  const maxDayCount = Math.max(1, ...chartDays.map((d) => dailyByDay[d].sent + dailyByDay[d].failed + dailyByDay[d].queued));

  return (
    <div style={{ maxWidth: "1200px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem" }}>🩺 SMTP Health Dashboard</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            Monitor SMTP performance, limits, and per-email send history
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(parseInt(e.target.value))}
            style={{
              padding: "0.4rem 0.75rem", borderRadius: "0.5rem",
              border: "1px solid var(--border)", background: "var(--bg-secondary)",
              color: "var(--text)", fontSize: "0.8rem",
            }}
          >
            <option value={1}>Last 1 day</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={() => fetchData()}
            style={{
              padding: "0.4rem 0.75rem", borderRadius: "0.5rem",
              border: "1px solid var(--border)", background: "var(--bg-secondary)",
              color: "var(--text)", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent)" }}>{configs.filter(c => c.enabled).length}/{configs.length}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Active SMTPs</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#10b981" }}>{totalSentToday}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Sent Today</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f59e0b" }}>{totalHourlySent}/{totalHourlyCapacity}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>This Hour</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#6366f1" }}>{totalAllTimeSent.toLocaleString()}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>All-Time Sent</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: totalAllTimeFailed > 0 ? "#ef4444" : "#10b981" }}>{totalAllTimeFailed.toLocaleString()}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>All-Time Failed</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)" }}>Resets at</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }}>Midnight PT</div>
          <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{refreshTime}</div>
        </div>
      </div>

      {/* Daily Chart */}
      {chartDays.length > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
          <h3 style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "1rem" }}>📊 Sending Activity ({daysFilter} days)</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "120px" }}>
            {chartDays.map((day) => {
              const d = dailyByDay[day];
              const total = d.sent + d.failed + d.queued;
              const height = (total / maxDayCount) * 100;
              return (
                <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                  <div style={{ fontSize: "0.6rem", color: "var(--muted)" }}>{total}</div>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100px" }}>
                    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: `${height}%` }}>
                      {d.queued > 0 && <div style={{ background: "#f59e0b", flex: d.queued, minHeight: "2px", borderRadius: "2px 2px 0 0" }} />}
                      {d.failed > 0 && <div style={{ background: "#ef4444", flex: d.failed, minHeight: "2px" }} />}
                      {d.sent > 0 && <div style={{ background: "#10b981", flex: d.sent, minHeight: "2px", borderRadius: d.queued === 0 && d.failed === 0 ? "2px 2px 0 0" : "0" }} />}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.55rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {day.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.7rem" }}>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#10b981", borderRadius: "2px", marginRight: "4px" }} />Sent</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#ef4444", borderRadius: "2px", marginRight: "4px" }} />Failed</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#f59e0b", borderRadius: "2px", marginRight: "4px" }} />Queued</span>
          </div>
        </div>
      )}

      {/* SMTP Cards */}
      <div style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
        {configs.map((c) => {
          const dailyUsed = c.rate_usage?.daily_used || 0;
          const hourlyUsed = c.rate_usage?.hourly_used || 0;
          const dailyPct = c.daily_limit > 0 ? (dailyUsed / c.daily_limit) * 100 : 0;
          const hourlyPct = c.hourly_limit > 0 ? (hourlyUsed / c.hourly_limit) * 100 : 0;
          const isSelected = selectedSmtp === c.id;

          return (
            <div
              key={c.id}
              className="card"
              style={{
                borderLeft: `4px solid ${isSelected ? "#6366f1" : c.enabled ? (dailyPct >= 90 ? "#ef4444" : dailyPct >= 70 ? "#f59e0b" : "#10b981") : "#94a3b8"}`,
                cursor: "pointer",
                background: isSelected ? "rgba(99,102,241,0.05)" : undefined,
              }}
              onClick={() => setSelectedSmtp(isSelected ? null : c.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.enabled ? "#10b981" : "#ef4444" }} />
                    <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>{c.name}</h3>
                    {isSelected && <span style={{ fontSize: "0.65rem", background: "var(--accent)", color: "white", padding: "0.15rem 0.5rem", borderRadius: "0.75rem" }}>VIEWING LOGS</span>}
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    {c.from_email} • {c.host}:{c.port}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: dailyPct >= 90 ? "#ef4444" : dailyPct >= 70 ? "#f59e0b" : "#10b981" }}>
                    {dailyUsed}/{c.daily_limit}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>sent today</div>
                </div>
              </div>

              {/* Stats Row */}
              <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem", fontSize: "0.75rem" }}>
                <div>
                  <span style={{ color: "var(--muted)" }}>All-time: </span>
                  <span style={{ fontWeight: 600, color: "#10b981" }}>{c.stats?.total_sent?.toLocaleString() || 0} sent</span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: c.stats?.total_failed ? "#ef4444" : "#10b981" }}>{c.stats?.total_failed || 0} failed</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Rate: </span>
                  <span style={{ fontWeight: 600, color: parseFloat(c.stats?.success_rate || "0") >= 95 ? "#10b981" : "#f59e0b" }}>{c.stats?.success_rate || "0.0"}%</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Last used: </span>
                  <span style={{ fontWeight: 500 }}>{c.last_used ? formatDate(c.last_used) : "Never"}</span>
                </div>
              </div>

              {/* Daily Progress */}
              <div style={{ marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
                  <span>Daily</span>
                  <span>{dailyUsed}/{c.daily_limit} ({dailyPct.toFixed(0)}%)</span>
                </div>
                <div style={{ height: "8px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "4px", width: `${dailyPct}%`,
                    background: dailyPct >= 90 ? "linear-gradient(90deg, #ef4444, #f87171)" : dailyPct >= 70 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" : "linear-gradient(90deg, #10b981, #34d399)",
                    transition: "width 0.5s",
                  }} />
                </div>
              </div>

              {/* Hourly Progress */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
                  <span>Hourly</span>
                  <span>{hourlyUsed}/{c.hourly_limit} ({hourlyPct.toFixed(0)}%)</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", width: `${hourlyPct}%`,
                    background: hourlyPct >= 90 ? "linear-gradient(90deg, #ef4444, #f87171)" : hourlyPct >= 70 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" : "linear-gradient(90deg, #6366f1, #818cf8)",
                    transition: "width 0.5s",
                  }} />
                </div>
              </div>

              {/* Status Badges */}
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {dailyPct >= 90 && <span style={{ padding: "0.15rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>🚫 Near Daily Limit</span>}
                {hourlyPct >= 90 && <span style={{ padding: "0.15rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>⚠️ Near Hourly Limit</span>}
                {dailyPct < 50 && hourlyPct < 50 && <span style={{ padding: "0.15rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>✅ Healthy</span>}
                {!c.enabled && <span style={{ padding: "0.15rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: "rgba(148,163,184,0.1)", color: "#94a3b8" }}>⏸️ Disabled</span>}
                <span style={{ padding: "0.15rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                  {c.enabled ? "✅ Enabled" : "❌ Disabled"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Send Logs for Selected SMTP */}
      {selectedSmtp && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              📧 Send History — {configs.find(c => c.id === selectedSmtp)?.name}
            </h3>
            <button
              onClick={() => setSelectedSmtp(null)}
              style={{
                padding: "0.3rem 0.75rem", borderRadius: "0.5rem",
                border: "1px solid var(--border)", background: "var(--bg-secondary)",
                color: "var(--text)", fontSize: "0.75rem", cursor: "pointer",
              }}
            >
              ✕ Close
            </button>
          </div>

          {sendLogs.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "1rem 0" }}>No send logs found for this SMTP config.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)", fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)", fontWeight: 600 }}>Recipient</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)", fontWeight: 600 }}>Campaign</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)", fontWeight: 600 }}>Subject</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)", fontWeight: 600 }}>Sent At</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)", fontWeight: 600 }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {sendLogs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        <span style={{ color: statusColor(log.status) }}>{statusIcon(log.status)} {log.status}</span>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>
                        {log.contact_name ? `${log.contact_name} ` : ""}{log.contact_email}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "var(--muted)" }}>{log.campaign_name}</td>
                      <td style={{ padding: "0.4rem 0.5rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject_used}</td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "var(--muted)", fontSize: "0.75rem" }}>{formatDate(log.sent_at)}</td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "#ef4444", fontSize: "0.7rem", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.error_message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reset Info */}
      <div className="card" style={{ background: "rgba(99,102,241,0.05)" }}>
        <h3 style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>⏰ When Do Limits Reset?</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.8rem" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Daily Limits</div>
            <div style={{ color: "var(--muted)" }}>Reset at midnight Pacific Time (PDT/PST)</div>
            <div style={{ color: "var(--accent)", fontWeight: 600 }}>Next reset: {refreshTime}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>Hourly Limits</div>
            <div style={{ color: "var(--muted)" }}>Rolling window — resets 60 minutes after each send</div>
            <div style={{ color: "var(--accent)", fontWeight: 600 }}>Auto-resume enabled ✅</div>
          </div>
        </div>
      </div>
    </div>
  );
}
