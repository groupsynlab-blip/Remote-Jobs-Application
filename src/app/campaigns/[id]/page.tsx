"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "sent" | "failed" | "queued">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetch(`/api/campaigns/${id}/details`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>Loading campaign details...</div>
  );

  if (!data) return (
    <div style={{ padding: "2rem", textAlign: "center", color: "var(--danger)" }}>Campaign not found</div>
  );

  const { campaign, logs, smtp_stats, status_breakdown } = data;
  const filteredLogs = logs.filter((log: any) => {
    if (filter !== "all" && log.status !== filter) return false;
    if (search && !log.contact_email?.toLowerCase().includes(search.toLowerCase()) &&
        !log.contact_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const pagedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusCounts: Record<string, number> = {};
  for (const s of status_breakdown) statusCounts[s.status] = s.count;

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button onClick={() => router.push("/history")} style={{
          fontSize: "0.8rem", color: "var(--accent)", background: "none", border: "none",
          cursor: "pointer", marginBottom: "0.5rem", fontWeight: 500,
        }}>← Back to History</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{campaign.name}</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.25rem" }}>
          <span style={{
            padding: "0.2rem 0.625rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600,
            background: campaign.status === "sent" ? "rgba(34,197,94,0.1)" : campaign.status === "paused" ? "rgba(234,179,8,0.1)" : campaign.status === "sending" ? "rgba(59,130,246,0.1)" : "var(--border)",
            color: campaign.status === "sent" ? "#10b981" : campaign.status === "paused" ? "#eab308" : campaign.status === "sending" ? "#3b82f6" : "var(--muted)",
            textTransform: "uppercase",
          }}>{campaign.status}</span>
          {campaign.tags && <span style={{ fontSize: "0.7rem", color: "var(--accent)" }}>#{campaign.tags}</span>}
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginLeft: "auto" }}>
            {campaign.created_at ? new Date(campaign.created_at).toLocaleString() : ""}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Total", value: campaign.total_count, color: "var(--accent)", bg: "rgba(99,102,241,0.08)" },
          { label: "Sent ✅", value: statusCounts.sent || 0, color: "#10b981", bg: "rgba(34,197,94,0.08)" },
          { label: "Failed ❌", value: statusCounts.failed || 0, color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
          { label: "Queued 📧", value: statusCounts.queued || 0, color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
        ].map((card) => (
          <div key={card.label} style={{ padding: "0.75rem", borderRadius: "0.5rem", background: card.bg, textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ height: "8px", borderRadius: "4px", background: "var(--border)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: "4px",
            width: `${campaign.total_count > 0 ? ((statusCounts.sent || 0) / campaign.total_count) * 100 : 0}%`,
            background: "linear-gradient(90deg, #10b981, #34d399)",
            transition: "width 0.5s",
          }} />
        </div>
      </div>

      {/* Per-SMTP Stats */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>📊 Per-SMTP Breakdown</h3>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(smtp_stats.length, 3)}, 1fr)`, gap: "0.5rem" }}>
          {smtp_stats.map((smtp: any) => (
            <div key={smtp.smtp_config_id || 'none'} style={{
              padding: "0.75rem", borderRadius: "0.5rem",
              border: "1px solid var(--border)", background: "var(--bg-secondary)",
            }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.5rem" }}>{smtp.smtp_name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.7rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Sent</span>
                  <span style={{ color: "#10b981", fontWeight: 600 }}>{smtp.sent}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Failed</span>
                  <span style={{ color: "#ef4444", fontWeight: 600 }}>{smtp.failed}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Queued</span>
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>{smtp.queued}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: "0.25rem", marginTop: "0.25rem" }}>
                  <span style={{ color: "var(--muted)" }}>Success Rate</span>
                  <span style={{ fontWeight: 600, color: smtp.total > 0 && smtp.sent / smtp.total >= 0.9 ? "#10b981" : smtp.sent / smtp.total >= 0.7 ? "#f59e0b" : "#ef4444" }}>
                    {smtp.total > 0 ? Math.round((smtp.sent / smtp.total) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {(["all", "sent", "failed", "queued"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }} style={{
              padding: "0.3rem 0.75rem", borderRadius: "0.75rem", border: "none",
              fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
              background: filter === f ? "var(--accent)" : "var(--border)",
              color: filter === f ? "#fff" : "var(--muted)",
            }}>{f === "all" ? "All" : f === "sent" ? `✅ Sent (${statusCounts[f] || 0})` : f === "failed" ? `❌ Failed (${statusCounts[f] || 0})` : `📧 Queued (${statusCounts[f] || 0})`}</button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            padding: "0.3rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)",
            fontSize: "0.75rem", flex: 1, minWidth: "150px", background: "var(--background)",
          }}
        />
      </div>

      {/* Email Log Table */}
      <div style={{ borderRadius: "0.5rem", border: "1px solid var(--border)", overflow: "hidden", marginBottom: "1rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Email</th>
              <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Name</th>
              <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Status</th>
              <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>SMTP Used</th>
              <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Subject</th>
              <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {pagedLogs.map((log: any) => (
              <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem 0.75rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {log.contact_email}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "var(--muted)" }}>
                  {log.contact_name || "—"}
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <span style={{
                    padding: "0.125rem 0.5rem", borderRadius: "0.75rem", fontSize: "0.65rem", fontWeight: 600,
                    background: log.status === "sent" ? "rgba(34,197,94,0.15)" : log.status === "failed" ? "rgba(239,68,68,0.15)" : log.status === "queued" ? "rgba(245,158,11,0.15)" : "var(--border)",
                    color: log.status === "sent" ? "#10b981" : log.status === "failed" ? "#ef4444" : log.status === "queued" ? "#f59e0b" : "var(--muted)",
                  }}>
                    {log.status === "sent" ? "✅ Sent" : log.status === "failed" ? "❌ Failed" : log.status === "queued" ? "📧 Queued" : log.status}
                  </span>
                  {log.error_message && (
                    <div style={{ fontSize: "0.6rem", color: "var(--danger)", marginTop: "0.125rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.error_message}
                    </div>
                  )}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "var(--muted)" }}>
                  {log.smtp_name || "—"}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>
                  {log.subject_used || "—"}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {log.sent_at ? new Date(log.sent_at).toLocaleString() : log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {pagedLogs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted)" }}>
                  No emails match the current filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{
            padding: "0.3rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)",
            background: "var(--bg-secondary)", color: page === 1 ? "var(--muted)" : "var(--text)",
            fontSize: "0.75rem", cursor: page === 1 ? "default" : "pointer",
          }}>← Prev</button>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Page {page} of {totalPages} ({filteredLogs.length} emails)
          </span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{
            padding: "0.3rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)",
            background: "var(--bg-secondary)", color: page === totalPages ? "var(--muted)" : "var(--text)",
            fontSize: "0.75rem", cursor: page === totalPages ? "default" : "pointer",
          }}>Next →</button>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => router.push("/compose")} style={{ fontSize: "0.8rem" }}>
          ← Compose
        </button>
        <button className="btn btn-secondary" onClick={() => router.push("/history")} style={{ fontSize: "0.8rem" }}>
          📋 History
        </button>
        <button className="btn btn-secondary" onClick={() => {
          // Build printable report
          const successRate = campaign.total_count > 0 ? Math.round(((statusCounts.sent || 0) / campaign.total_count) * 100) : 0;
          const smtpRows = smtp_stats.map((s: any) =>
            `<tr><td>${s.smtp_name}</td><td>${s.sent}</td><td>${s.failed}</td><td>${s.queued}</td><td>${s.total > 0 ? Math.round((s.sent / s.total) * 100) : 0}%</td></tr>`
          ).join('');
          const emailRows = logs.map((l: any) =>
            `<tr><td>${l.contact_email}</td><td>${l.contact_name || ''}</td><td>${l.status}</td><td>${l.smtp_name || ''}</td><td>${l.sent_at || l.created_at || ''}</td></tr>`
          ).join('');
          const reportHtml = `<!DOCTYPE html><html><head><title>Campaign Report - ${campaign.name}</title><style>
            body{font-family:Arial,sans-serif;padding:2rem;color:#1a1a2e}
            h1{font-size:1.5rem;margin-bottom:0.25rem}
            .subtitle{color:#666;font-size:0.85rem;margin-bottom:1.5rem}
            .stats{display:flex;gap:1rem;margin-bottom:1.5rem}
            .stat-box{padding:1rem;border:1px solid #e5e7eb;border-radius:8px;text-align:center;min-width:100px}
            .stat-box .num{font-size:1.5rem;font-weight:700}
            .stat-box .lbl{font-size:0.75rem;color:#666}
            table{width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:1rem}
            th{text-align:left;padding:0.5rem;background:#f3f4f6;border-bottom:2px solid #e5e7eb}
            td{padding:0.4rem 0.5rem;border-bottom:1px solid #e5e7eb}
            h2{font-size:1rem;margin:1.5rem 0 0.75rem}
            .footer{margin-top:2rem;font-size:0.7rem;color:#999;border-top:1px solid #e5e7eb;padding-top:0.5rem}
            @media print{body{padding:0.5rem}
          </style></head><body>
            <h1>Campaign Delivery Report</h1>
            <div class="subtitle">${campaign.name} — ${campaign.status.toUpperCase()} — ${campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : ''}</div>
            <div class="stats">
              <div class="stat-box"><div class="num" style="color:#6366f1">${campaign.total_count}</div><div class="lbl">Total Emails</div></div>
              <div class="stat-box"><div class="num" style="color:#10b981">${statusCounts.sent || 0}</div><div class="lbl">Delivered</div></div>
              <div class="stat-box"><div class="num" style="color:#ef4444">${statusCounts.failed || 0}</div><div class="lbl">Failed</div></div>
              <div class="stat-box"><div class="num" style="color:#10b981">${successRate}%</div><div class="lbl">Success Rate</div></div>
            </div>
            <h2>Per-SMTP Performance</h2>
            <table><thead><tr><th>SMTP Account</th><th>Sent</th><th>Failed</th><th>Queued</th><th>Success Rate</th></tr></thead><tbody>${smtpRows}</tbody></table>
            <h2>All Emails (${logs.length} total)</h2>
            <table><thead><tr><th>Email</th><th>Name</th><th>Status</th><th>SMTP Used</th><th>Sent At</th></tr></thead><tbody>${emailRows}</tbody></table>
            <div class="footer">Generated by Bulk Emailer — ${new Date().toLocaleString()}</div>
          </body></html>`;
          const win = window.open('', '_blank');
          if (win) { win.document.write(reportHtml); win.document.close(); setTimeout(() => win.print(), 500); }
        }} style={{ fontSize: "0.8rem" }}>
          🖨️ Print / PDF
        </button>
        {campaign.status === "paused" && (
          <button className="btn btn-primary" onClick={() => router.push("/compose")} style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
            ▶ Resume Sending
          </button>
        )}
      </div>
    </div>
  );
}
