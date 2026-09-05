"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Campaign { id: string; name: string; status: string; total_count: number; sent_count: number; failed_count: number; created_at: string; sent_at: string; tags: string; }

export default function HistoryPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [smtpHistory, setSmtpHistory] = useState<any[]>([]);

  useEffect(() => { fetchCampaigns(); }, []);

  const fetchCampaigns = () => {
    fetch("/api/campaigns").then(r => r.json()).then((data: any) => {
      setCampaigns(Array.isArray(data) ? data : data.campaigns || []);
    });
  };

  const fetchSmtpHistory = (campaignId: string) => {
    setSelectedCampaign(campaignId);
    fetch(`/api/campaigns/${campaignId}`).then(r => r.json()).then(d => {
      setSmtpHistory(d.logs || []);
    });
  };

  const filtered = campaigns.filter(c => filter === "all" || c.status === filter);

  // Calculate totals
  const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
  const totalFailed = campaigns.reduce((sum, c) => sum + (c.failed_count || 0), 0);
  const totalEmails = totalSent + totalFailed;
  const deliveryRate = totalEmails > 0 ? ((totalSent / totalEmails) * 100).toFixed(1) : "0";

  const statusColors: Record<string, string> = {
    sent: "#10b981", sending: "#6366f1", draft: "#94a3b8", failed: "#ef4444", paused: "#f59e0b", scheduled: "#f59e0b",
  };

  return (
    <div style={{ maxWidth: "1200px" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Campaign History</h1>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>{campaigns.length}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Total Campaigns</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10b981" }}>{totalSent.toLocaleString()}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Emails Sent</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#ef4444" }}>{totalFailed.toLocaleString()}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Failed</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10b981" }}>{deliveryRate}%</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Delivery Rate</div>
        </div>
      </div>

      {/* Delivery Rate Bar */}
      {totalEmails > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>Overall Delivery Rate</div>
          <div style={{ height: "24px", borderRadius: "12px", background: "var(--bg-secondary)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${(totalSent / totalEmails) * 100}%`, background: "linear-gradient(90deg, #10b981, #34d399)", transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            <span>✅ {totalSent} sent</span>
            <span>❌ {totalFailed} failed</span>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {["all", "sent", "sending", "paused", "failed", "draft"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "0.375rem 0.875rem", borderRadius: "1rem", border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
            background: filter === f ? "var(--accent)" : "var(--bg-card-solid)", color: filter === f ? "#fff" : "var(--muted)",
            textTransform: "capitalize",
          }}>{f}</button>
        ))}
      </div>

      {/* Export Buttons */}
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
        <a href="/api/export?type=analytics" download style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border)",
          background: "var(--bg-card-solid)", color: "var(--fg-secondary)",
          fontWeight: 600, fontSize: "0.8rem", textDecoration: "none",
        }}>📥 Export Analytics (CSV)</a>
        <a href="/api/smtp-health/report?days=30" target="_blank" style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--accent)",
          background: "var(--accent)", color: "#fff",
          fontWeight: 600, fontSize: "0.8rem", textDecoration: "none",
        }}>📄 SMTP Delivery Report (PDF)</a>
      </div>

      {/* Campaign List */}
      <div className="card">
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</p>
            <p>No campaigns yet. Create one in the Compose page!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {filtered.map(c => {
              const pct = c.total_count > 0 ? Math.round(((c.sent_count || 0) / c.total_count) * 100) : 0;
              const sc = statusColors[c.status] || "#94a3b8";
              return (
                <div key={c.id} onClick={() => fetchSmtpHistory(c.id)} style={{
                  padding: "1rem", borderRadius: "0.75rem", border: `1px solid ${selectedCampaign === c.id ? sc : "var(--border)"}`,
                  background: selectedCampaign === c.id ? `${sc}08` : "transparent", cursor: "pointer", transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{c.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                        {c.tags && <span style={{ marginLeft: "0.5rem", padding: "0.125rem 0.5rem", borderRadius: "1rem", background: "var(--accent-light)", color: "var(--accent)", fontSize: "0.65rem" }}>{c.tags}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{c.sent_count || 0}/{c.total_count}</div>
                        <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{pct}% sent</div>
                      </div>
                      <span style={{ padding: "0.2rem 0.625rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: `${sc}15`, color: sc, textTransform: "uppercase" }}>{c.status}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: "0.5rem", height: "4px", borderRadius: "2px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: sc, borderRadius: "2px", transition: "width 0.3s" }} />
                  </div>
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <button onClick={(e) => { e.stopPropagation(); router.push(`/campaigns/${c.id}`); }} style={{
                      padding: "0.25rem 0.625rem", borderRadius: "0.375rem", border: "1px solid var(--border)",
                      background: "var(--bg-secondary)", color: "var(--accent)", fontSize: "0.7rem",
                      fontWeight: 600, cursor: "pointer",
                    }}>📋 View Details</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SMTP History Modal */}
      {selectedCampaign && smtpHistory.length > 0 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>📧 SMTP Send History</h3>
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            <table>
              <thead><tr><th>Email</th><th>Status</th><th>SMTP</th><th>Subject</th><th>Sent At</th></tr></thead>
              <tbody>
                {smtpHistory.slice(0, 100).map((log: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: "0.75rem" }}>{log.contact_email}</td>
                    <td><span style={{ padding: "0.125rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600, background: log.status === "sent" ? "rgba(16,185,129,0.1)" : log.status === "failed" ? "rgba(239,68,68,0.1)" : log.status === "skipped" ? "rgba(245,158,11,0.1)" : "var(--bg-secondary)", color: log.status === "sent" ? "#10b981" : log.status === "failed" ? "#ef4444" : log.status === "skipped" ? "#f59e0b" : "var(--muted)" }}>{log.status}</span></td>
                    <td style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{log.smtp_config_id ? log.smtp_config_id.slice(0, 8) + "..." : "—"}</td>
                    <td style={{ fontSize: "0.7rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject_used || "—"}</td>
                    <td style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{log.sent_at ? new Date(log.sent_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
