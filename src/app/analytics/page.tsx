"use client";

import { useState, useEffect } from "react";

interface Overview {
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  total_bounces: number;
  total_unsubscribes: number;
  open_rate: string;
  click_rate: string;
  bounce_rate: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  sent_count: number;
  failed_count: number;
  open_count: number;
  open_rate: string;
  created_at: string;
}

interface BouncedEmail {
  email: string;
  bounce_type: string;
  error_message: string;
  bounced_at: string;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [topCampaigns, setTopCampaigns] = useState<Campaign[]>([]);
  const [bouncedEmails, setBouncedEmails] = useState<BouncedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((data) => {
        setOverview(data.overview);
        setRecentCampaigns(data.recent_campaigns || []);
        setTopCampaigns(data.top_campaigns || []);
        setBouncedEmails(data.bounced_emails || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "2rem", color: "var(--muted)" }}>Loading analytics...</div>;
  if (!overview) return <div style={{ padding: "2rem", color: "var(--muted)" }}>No data available</div>;

  const statCards = [
    { label: "Emails Sent", value: overview.total_sent.toLocaleString(), icon: "📤", color: "#6366f1" },
    { label: "Open Rate", value: `${overview.open_rate}%`, icon: "👁️", color: "#22c55e" },
    { label: "Click Rate", value: `${overview.click_rate}%`, icon: "🖱️", color: "#3b82f6" },
    { label: "Bounce Rate", value: `${overview.bounce_rate}%`, icon: " bounced", color: "#f59e0b" },
    { label: "Total Opens", value: overview.total_opens.toLocaleString(), icon: "📧", color: "#8b5cf6" },
    { label: "Total Clicks", value: overview.total_clicks.toLocaleString(), icon: "🔗", color: "#ec4899" },
    { label: "Bounced", value: overview.total_bounces.toLocaleString(), icon: "⚠️", color: "#ef4444" },
    { label: "Unsubscribed", value: overview.total_unsubscribes.toLocaleString(), icon: "🚪", color: "#64748b" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📈 Campaign Analytics</h1>
        <a href="/api/export?type=analytics" download style={{
          padding: "0.5rem 1rem", borderRadius: "0.4rem", border: "1px solid var(--border)",
          background: "var(--bg-secondary)", color: "var(--text)", fontSize: "0.8rem",
          textDecoration: "none", fontWeight: 600,
        }}>📥 Export CSV</a>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {statCards.map((s) => (
          <div key={s.label} className="card" style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: s.color, marginTop: "0.25rem" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Visual Bars */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>Delivery Funnel</h3>
        {[
          { label: "Sent", value: overview.total_sent, max: overview.total_sent, color: "#6366f1" },
          { label: "Opened", value: overview.total_opens, max: overview.total_sent, color: "#22c55e" },
          { label: "Clicked", value: overview.total_clicks, max: overview.total_sent, color: "#3b82f6" },
          { label: "Bounced", value: overview.total_bounces, max: overview.total_sent || 1, color: "#ef4444" },
          { label: "Unsubscribed", value: overview.total_unsubscribes, max: overview.total_sent || 1, color: "#64748b" },
        ].map((bar) => (
          <div key={bar.label} style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              <span style={{ fontWeight: 600 }}>{bar.label}</span>
              <span style={{ color: "var(--muted)" }}>{bar.value.toLocaleString()}</span>
            </div>
            <div style={{ height: "8px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "4px",
                width: `${bar.max > 0 ? Math.min(100, (bar.value / bar.max) * 100) : 0}%`,
                background: bar.color, transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent Campaigns */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>Recent Campaigns</h3>
        {recentCampaigns.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No campaigns yet</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)" }}>Name</th>
                <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--muted)" }}>Sent</th>
                <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--muted)" }}>Opens</th>
                <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--muted)" }}>Open Rate</th>
                <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--muted)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentCampaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>{c.sent_count}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>{c.open_count}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right", color: "#22c55e", fontWeight: 600 }}>{c.open_rate}%</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>
                    <span style={{
                      padding: "0.15rem 0.5rem", borderRadius: "1rem", fontSize: "0.7rem",
                      background: c.status === "completed" ? "rgba(34,197,94,0.1)" : c.status === "sending" ? "rgba(99,102,241,0.1)" : "rgba(100,116,139,0.1)",
                      color: c.status === "completed" ? "#22c55e" : c.status === "sending" ? "#6366f1" : "#64748b",
                    }}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bounced Emails */}
      {bouncedEmails.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>⚠️ Bounced Emails (Auto-blocked)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)" }}>Email</th>
                <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--muted)" }}>Error</th>
                <th style={{ textAlign: "right", padding: "0.5rem", color: "var(--muted)" }}>Bounced At</th>
              </tr>
            </thead>
            <tbody>
              {bouncedEmails.map((b, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>{b.email}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={{ color: b.bounce_type === "hard" ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>{b.bounce_type}</span>
                  </td>
                  <td style={{ padding: "0.5rem", color: "var(--muted)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis" }}>{b.error_message}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--muted)" }}>{b.bounced_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
