"use client";

import { useEffect, useState } from "react";

// ─── Pure CSS Donut Chart ──────────────────────────────────────
const COLORS: Record<string, string> = { sent: "#22c55e", failed: "#ef4444", queued: "#a1a1aa", remaining: "#d4d4d8", accent: "#6366f1" };

function DonutChart({ segments, size = 140 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#d4d4d8", opacity: 0.3 }} />;

  let cumulative = 0;
  const gradientParts: string[] = [];
  for (const seg of segments) {
    const start = (cumulative / total) * 360;
    cumulative += seg.value;
    const end = (cumulative / total) * 360;
    gradientParts.push(`${COLORS[seg.color] || seg.color} ${start}deg ${end}deg`);
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `conic-gradient(${gradientParts.join(", ")})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <div style={{
        width: size * 0.6, height: size * 0.6, borderRadius: "50%",
        background: "#ffffff", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{total.toLocaleString()}</div>
        <div style={{ fontSize: "0.6rem", color: "#71717a" }}>Total</div>
      </div>
    </div>
  );
}

// ─── Horizontal Bar Chart ──────────────────────────────────────
function BarChart({ campaigns, maxVal }: { campaigns: { name: string; sent: number; failed: number; opened: number; total: number }[]; maxVal: number }) {
  if (campaigns.length === 0 || maxVal === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {campaigns.map((c, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: "100px", fontSize: "0.7rem", color: "var(--muted)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>
            {c.name.length > 14 ? c.name.substring(0, 14) + "…" : c.name}
          </div>
          <div style={{ flex: 1, height: "18px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${(c.sent / maxVal) * 100}%`, background: COLORS.sent, transition: "width 0.5s" }} title={`Sent: ${c.sent}`} />
            <div style={{ width: `${(c.failed / maxVal) * 100}%`, background: COLORS.failed, transition: "width 0.5s" }} title={`Failed: ${c.failed}`} />
          </div>
          <div style={{ width: "60px", fontSize: "0.65rem", color: "var(--muted)", textAlign: "right" }}>
            {c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, color, icon, subtitle }: { label: string; value: string | number; color: string; icon: string; subtitle?: string }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
      <div style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>{icon}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 500 }}>{label}</div>
      {subtitle && <div style={{ fontSize: "0.6rem", color: "var(--muted)", marginTop: "0.125rem" }}>{subtitle}</div>}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function HistoryPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [campaignDetails, setCampaignDetails] = useState<any>(null);

  useEffect(() => { loadCampaigns(); }, []);

  const loadCampaigns = async () => {
    const res = await fetch("/api/campaigns");
    setCampaigns(await res.json());
    setLoading(false);
  };

  const viewDetails = async (campaign: any) => {
    setSelectedCampaign(campaign);
    const res = await fetch(`/api/campaigns/${campaign.id}`);
    setCampaignDetails(await res.json());
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign and its logs?")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setSelectedCampaign(null);
    setCampaignDetails(null);
    loadCampaigns();
  };

  const [retrying, setRetrying] = useState(false);
  const retryFailed = async (id: string) => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.requeued > 0) {
        // Refresh the campaign details
        const detailRes = await fetch(`/api/campaigns/${id}`);
        setCampaignDetails(await detailRes.json());
        setSelectedCampaign((prev: any) => prev ? { ...prev, status: "sending" } : prev);
        alert(`✅ Re-queued ${data.requeued} failed emails. Go to Compose to resume sending.`);
      } else {
        alert(data.message || "No failed emails to retry.");
      }
    } catch (err) {
      alert("Failed to retry emails.");
    } finally {
      setRetrying(false);
    }
  };

  // ─── Aggregate stats across all campaigns ──────────────
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalFailed = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0);
  const totalEmails = campaigns.reduce((s, c) => s + (c.total_count || 0), 0);
  const totalOpened = campaigns.reduce((s, c) => s + (c.open_count || 0), 0);
  const totalUnsubscribed = campaigns.reduce((s, c) => s + (c.unsubscribe_count || 0), 0);
  const overallDeliveryRate = totalSent > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : "0.0";
  const overallOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0.0";

  // Campaign data for bar chart
  const chartData = campaigns
    .filter((c) => (c.sent_count || 0) + (c.failed_count || 0) > 0)
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      sent: c.sent_count || 0,
      failed: c.failed_count || 0,
      opened: c.open_count || 0,
      total: c.total_count || 0,
    }));
  const chartMax = Math.max(...chartData.map((c) => c.sent + c.failed), 1);

  // Extract unique subjects used from logs (for detail view)
  const subjectsUsed = campaignDetails?.logs
    ?.filter((log: any) => log.subject_used)
    .reduce((acc: string[], log: any) => {
      if (!acc.includes(log.subject_used)) acc.push(log.subject_used);
      return acc;
    }, []) || [];

  // Parse subject_rotation from campaign
  let rotationSubjects: string[] = [];
  if (selectedCampaign?.subject_rotation) {
    try { rotationSubjects = JSON.parse(selectedCampaign.subject_rotation); } catch {}
  }

  // ─── ERROR BREAKDOWN for detail view ────────────────────
  const errorBreakdown: Record<string, number> = {};
  if (campaignDetails?.logs) {
    for (const log of campaignDetails.logs) {
      if (log.status === "failed" && log.error_message) {
        // Normalize error message (truncate common long strings)
        const key = log.error_message.length > 60 ? log.error_message.substring(0, 60) + "…" : log.error_message;
        errorBreakdown[key] = (errorBreakdown[key] || 0) + 1;
      }
    }
  }
  const sortedErrors = Object.entries(errorBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Campaign History</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>View past campaigns and their analytics</p>
      </div>

      {selectedCampaign ? (
        <div>
          <button className="btn btn-secondary" onClick={() => { setSelectedCampaign(null); setCampaignDetails(null); }} style={{ marginBottom: "1rem" }}>
            ← Back to list
          </button>

          {/* Campaign header card */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedCampaign.name}</h2>
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  Template: {selectedCampaign.template_name} • List: {selectedCampaign.list_name}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span className={`badge badge-${selectedCampaign.status}`}>{selectedCampaign.status}</span>
                {(selectedCampaign.failed_count || 0) > 0 && selectedCampaign.status !== "sending" && (
                  <button
                    className="btn btn-secondary"
                    style={{
                      padding: "0.25rem 0.625rem", fontSize: "0.75rem",
                      borderColor: "rgba(234, 179, 8, 0.5)", color: "rgb(234, 179, 8)",
                      fontWeight: 600, opacity: retrying ? 0.6 : 1,
                    }}
                    disabled={retrying}
                    onClick={() => retryFailed(selectedCampaign.id)}
                  >
                    {retrying ? "⏳ Re-queuing..." : `🔄 Retry ${selectedCampaign.failed_count} Failed`}
                  </button>
                )}
                <button className="btn btn-danger" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => deleteCampaign(selectedCampaign.id)}>
                  Delete
                </button>
              </div>
            </div>

            {/* Campaign config info */}
            <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {selectedCampaign.reply_to && (
                <div>
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>Reply-To: </span>
                  <span style={{ color: "var(--accent)" }}>{selectedCampaign.reply_to}</span>
                </div>
              )}
              {rotationSubjects.length > 0 && (
                <div>
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>Subject Rotation ({rotationSubjects.length} variations): </span>
                  <span style={{ color: "var(--accent)" }}>
                    {rotationSubjects.map((s: string, i: number) => (
                      <span key={i}>
                        {i > 0 && " → "}
                        <span style={{ padding: "0.125rem 0.375rem", background: "rgba(99, 102, 241, 0.1)", borderRadius: "0.25rem", marginRight: "0.25rem" }}>
                          {s.length > 50 ? s.substring(0, 50) + "..." : s}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <span>
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>Open Tracking: </span>
                  <span style={{ color: selectedCampaign.enable_tracking ? "var(--success)" : "var(--muted)" }}>
                    {selectedCampaign.enable_tracking ? "✅ Enabled" : "⏸ Disabled"}
                  </span>
                </span>
                <span>
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>Unsubscribe: </span>
                  <span style={{ color: selectedCampaign.enable_unsubscribe ? "var(--success)" : "var(--muted)" }}>
                    {selectedCampaign.enable_unsubscribe ? "✅ Enabled" : "⏸ Disabled"}
                  </span>
                </span>
                {(selectedCampaign.unsubscribe_count || 0) > 0 && (
                  <span>
                    <span style={{ color: "var(--muted)", fontWeight: 500 }}>Unsubscribes: </span>
                    <span style={{ color: "var(--warning)", fontWeight: 600 }}>{selectedCampaign.unsubscribe_count}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ═══ DETAIL VIEW: Charts & Stats ═══════════════ */}
          {campaignDetails?.stats && (
            <>
              {/* Stats + Donut side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
                {/* Donut chart */}
                <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>📊 Delivery Breakdown</h3>
                  <DonutChart
                    segments={[
                      { label: "Sent", value: campaignDetails.stats.sent, color: "sent" },
                      { label: "Failed", value: campaignDetails.stats.failed, color: "failed" },
                      { label: "Queued", value: campaignDetails.stats.queued || 0, color: "queued" },
                    ]}
                    size={160}
                  />
                  {/* Legend */}
                  <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", fontSize: "0.7rem" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.sent, display: "inline-block" }} />
                      Sent ({campaignDetails.stats.sent})
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.failed, display: "inline-block" }} />
                      Failed ({campaignDetails.stats.failed})
                    </span>
                    {(campaignDetails.stats.queued || 0) > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.queued, display: "inline-block" }} />
                        Queued ({campaignDetails.stats.queued})
                      </span>
                    )}
                  </div>
                </div>

                {/* Key metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <StatCard
                    icon="📤"
                    label="Delivery Rate"
                    value={`${campaignDetails.stats.sent + campaignDetails.stats.failed > 0 ? ((campaignDetails.stats.sent / (campaignDetails.stats.sent + campaignDetails.stats.failed)) * 100).toFixed(1) : 0}%`}
                    color="var(--success)"
                  />
                  <StatCard
                    icon="👁️"
                    label="Open Rate"
                    value={`${campaignDetails.stats.sent > 0 ? ((campaignDetails.stats.opened / campaignDetails.stats.sent) * 100).toFixed(1) : 0}%`}
                    color="var(--accent)"
                  />
                  <StatCard
                    icon="❌"
                    label="Failure Rate"
                    value={`${campaignDetails.stats.sent + campaignDetails.stats.failed > 0 ? ((campaignDetails.stats.failed / (campaignDetails.stats.sent + campaignDetails.stats.failed)) * 100).toFixed(1) : 0}%`}
                    color="var(--danger)"
                  />
                  <StatCard
                    icon="⏱️"
                    label="Speed"
                    value={campaignDetails.stats.total > 0 && campaignDetails.logs?.length > 0 ? (() => {
                      const sentLogs = campaignDetails.logs.filter((l: any) => l.sent_at);
                      if (sentLogs.length < 2) return "—";
                      const first = new Date(sentLogs[sentLogs.length - 1].sent_at).getTime();
                      const last = new Date(sentLogs[0].sent_at).getTime();
                      const minutes = (last - first) / 60000;
                      if (minutes <= 0) return "—";
                      const perMin = Math.round(sentLogs.length / minutes);
                      return `${perMin}/min`;
                    })() : "—"}
                    color="var(--warning)"
                  />
                </div>
              </div>

              {/* Delivery progress bar */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Campaign Progress</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                    {campaignDetails.stats.sent + campaignDetails.stats.failed} / {campaignDetails.stats.total} processed
                  </span>
                </div>
                <div className="progress-bar" style={{ height: "0.75rem" }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${campaignDetails.stats.total > 0 ? ((campaignDetails.stats.sent + campaignDetails.stats.failed) / campaignDetails.stats.total) * 100 : 0}%`,
                      background: `linear-gradient(to right, ${COLORS.sent} ${campaignDetails.stats.sent + campaignDetails.stats.failed > 0 ? (campaignDetails.stats.sent / (campaignDetails.stats.sent + campaignDetails.stats.failed)) * 100 : 0}%, ${COLORS.failed} ${campaignDetails.stats.sent + campaignDetails.stats.failed > 0 ? (campaignDetails.stats.sent / (campaignDetails.stats.sent + campaignDetails.stats.failed)) * 100 : 0}%)`,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.375rem", fontSize: "0.7rem", color: "var(--muted)" }}>
                  <span style={{ color: "var(--success)" }}>✅ {campaignDetails.stats.sent} sent</span>
                  <span style={{ color: "var(--danger)" }}>❌ {campaignDetails.stats.failed} failed</span>
                  <span style={{ color: "var(--accent)" }}>👁️ {campaignDetails.stats.opened} opened</span>
                </div>
              </div>

              {/* Error breakdown (if any) */}
              {sortedErrors.length > 0 && (
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                    ⚠️ Failure Breakdown
                    <span style={{ fontSize: "0.7rem", color: "var(--danger)", marginLeft: "0.5rem", fontWeight: 400 }}>
                      {campaignDetails.stats.failed} total failures
                    </span>
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {sortedErrors.map(([error, count], i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem" }}>
                        <div style={{
                          height: "6px", borderRadius: "3px", background: COLORS.failed,
                          width: `${(count / campaignDetails.stats.failed) * 100}%`, maxWidth: "200px",
                          minWidth: "6px", opacity: 0.7, flexShrink: 0,
                        }} />
                        <span style={{ color: "var(--danger)", fontWeight: 600, minWidth: "30px" }}>{count}</span>
                        <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Send Remaining / Retry actions */}
              {(campaignDetails.stats.queued || 0) > 0 && (
                <div className="card" style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                      {campaignDetails.stats.failed > 0 ? `🔄 ${campaignDetails.stats.failed} failed emails` : `📤 ${campaignDetails.stats.queued} emails remaining`}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      Go to Compose to resume sending remaining emails
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {campaignDetails.stats.failed > 0 && (
                      <button
                        className="btn btn-secondary"
                        disabled={retrying}
                        onClick={() => retryFailed(selectedCampaign.id)}
                        style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", borderColor: "rgba(234, 179, 8, 0.5)", color: "rgb(234, 179, 8)", fontWeight: 600 }}
                      >
                        {retrying ? "⏳ Re-queuing..." : "🔄 Retry Failed"}
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={() => window.location.href = "/compose"}
                      style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}
                    >
                      ▶ Send Remaining
                    </button>
                  </div>
                </div>
              )}

              {/* Subjects Used */}
              {subjectsUsed.length > 1 && (
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>📬 Subjects Used</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {subjectsUsed.map((subject: string, i: number) => {
                      const count = campaignDetails.logs.filter((l: any) => l.subject_used === subject && l.status === "sent").length;
                      return (
                        <span key={i} style={{
                          padding: "0.375rem 0.625rem", borderRadius: "0.375rem",
                          background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.8rem",
                        }}>
                          <span style={{ fontWeight: 600, color: "var(--accent)" }}>{subject.length > 40 ? subject.substring(0, 40) + "..." : subject}</span>
                          <span style={{ color: "var(--muted)", marginLeft: "0.375rem", fontSize: "0.75rem" }}>×{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Email logs table */}
          <div className="card">
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Email Logs</h3>
            {campaignDetails?.logs?.length === 0 ? (
              <p style={{ color: "var(--muted)", textAlign: "center", padding: "1rem" }}>No email logs yet</p>
            ) : (
              <div className="table-container" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Subject Used</th>
                      <th>Status</th>
                      <th>Opens</th>
                      <th>First Open</th>
                      <th>SMTP</th>
                      <th>Sent At</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignDetails?.logs?.map((log: any) => (
                      <tr key={log.id} style={log.status === "sent" && (log.open_count || 0) > 0 ? { background: "rgba(34, 197, 94, 0.03)" } : undefined}>
                        <td>{log.contact_email}</td>
                        <td style={{ color: "var(--muted)" }}>{log.contact_name || "—"}</td>
                        <td style={{ fontSize: "0.75rem", color: "var(--muted)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.subject_used || ""}>
                          {log.subject_used ? (log.subject_used.length > 30 ? log.subject_used.substring(0, 30) + "..." : log.subject_used) : "—"}
                        </td>
                        <td><span className={`badge badge-${log.status}`}>{log.status}</span></td>
                        <td>
                          <span style={{ fontWeight: 600, color: (log.open_count || 0) > 0 ? "var(--success)" : "var(--muted)" }}>
                            {log.open_count || 0}
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                          {log.first_opened_at ? new Date(log.first_opened_at).toLocaleString() : "—"}
                        </td>
                        <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                          {log.smtp_config_id ? `${log.smtp_config_id.substring(0, 8)}…` : "—"}
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {log.sent_at ? new Date(log.sent_at).toLocaleString() : "—"}
                        </td>
                        <td style={{ color: "var(--danger)", fontSize: "0.75rem", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {log.error_message || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ═══ LIST VIEW ════════════════════════════════════ */
        <div>
          {/* ─── Overall Stats Dashboard ──────────────────── */}
          {campaigns.length > 0 && (
            <>
              {/* Summary stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <StatCard icon="📧" label="Total Campaigns" value={campaigns.length} color="var(--accent)" />
                <StatCard icon="📤" label="Emails Sent" value={totalSent.toLocaleString()} color="var(--success)" subtitle={`${overallDeliveryRate}% delivery`} />
                <StatCard icon="❌" label="Failed" value={totalFailed.toLocaleString()} color="var(--danger)" subtitle={totalSent + totalFailed > 0 ? `${((totalFailed / (totalSent + totalFailed)) * 100).toFixed(1)}% rate` : undefined} />
                <StatCard icon="👁️" label="Total Opens" value={totalOpened.toLocaleString()} color="var(--warning)" subtitle={`${overallOpenRate}% rate`} />
                <StatCard icon="🔗" label="Unsubscribes" value={totalUnsubscribed} color={totalUnsubscribed > 0 ? "var(--danger)" : "var(--muted)"} />
              </div>

              {/* Charts row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
                {/* Donut chart */}
                <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>📊 Overall Delivery</h3>
                  <DonutChart
                    segments={[
                      { label: "Sent", value: totalSent, color: "sent" },
                      { label: "Failed", value: totalFailed, color: "failed" },
                      { label: "Remaining", value: Math.max(0, totalEmails - totalSent - totalFailed), color: "remaining" },
                    ]}
                    size={160}
                  />
                  {/* Delivery rate ring text */}
                  <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>{overallDeliveryRate}%</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Delivery Rate</div>
                  </div>
                  {/* Legend */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.75rem", fontSize: "0.7rem", width: "100%" }}>
                    <span style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.sent, display: "inline-block" }} />
                        Sent
                      </span>
                      <span style={{ fontWeight: 600 }}>{totalSent.toLocaleString()}</span>
                    </span>
                    <span style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.failed, display: "inline-block" }} />
                        Failed
                      </span>
                      <span style={{ fontWeight: 600 }}>{totalFailed.toLocaleString()}</span>
                    </span>
                    <span style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accent, display: "inline-block" }} />
                        Opened
                      </span>
                      <span style={{ fontWeight: 600 }}>{totalOpened.toLocaleString()} ({overallOpenRate}%)</span>
                    </span>
                  </div>
                </div>

                {/* Per-campaign bar chart */}
                <div className="card" style={{ padding: "1.5rem" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>📈 Per-Campaign Delivery</h3>
                  {chartData.length > 0 ? (
                    <>
                      <BarChart campaigns={chartData} maxVal={chartMax} />
                      <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.65rem", color: "var(--muted)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <span style={{ width: 10, height: 6, borderRadius: 2, background: COLORS.sent, display: "inline-block" }} /> Sent
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <span style={{ width: 10, height: 6, borderRadius: 2, background: COLORS.failed, display: "inline-block" }} /> Failed
                        </span>
                        <span style={{ marginLeft: "auto" }}>Percentage = sent / total</span>
                      </div>
                    </>
                  ) : (
                    <p style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>No campaign data to chart</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ─── Campaign Table ───────────────────────────── */}
          <div className="card">
            {loading ? (
              <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
            ) : campaigns.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>
                <p style={{ color: "var(--muted)" }}>No campaigns yet.</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Template</th>
                      <th>List</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Delivery</th>
                      <th>Opens</th>
                      <th>Compliance</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const deliveryRate = (c.sent_count || 0) + (c.failed_count || 0) > 0 ? ((c.sent_count / ((c.sent_count || 0) + (c.failed_count || 0))) * 100).toFixed(1) : "0.0";
                      const openRate = c.sent_count > 0 ? ((c.open_count || 0) / c.sent_count * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>
                            {c.name}
                            {c.reply_to && (
                              <span style={{ fontSize: "0.7rem", color: "var(--accent)", marginLeft: "0.375rem" }} title={`Reply-To: ${c.reply_to}`}>↩</span>
                            )}
                            {c.subject_rotation && (
                              <span style={{ fontSize: "0.7rem", color: "var(--accent)", marginLeft: "0.25rem" }} title="Subject rotation enabled">🔄</span>
                            )}
                          </td>
                          <td style={{ color: "var(--muted)" }}>{c.template_name}</td>
                          <td style={{ color: "var(--muted)" }}>{c.list_name}</td>
                          <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <div className="progress-bar" style={{ width: "80px" }}>
                                <div className="progress-fill" style={{ width: `${c.total_count > 0 ? ((c.sent_count + c.failed_count) / c.total_count) * 100 : 0}%` }} />
                              </div>
                              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{c.sent_count}/{c.total_count}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                              <span style={{
                                fontSize: "0.8rem", fontWeight: 600,
                                color: parseFloat(deliveryRate) >= 95 ? "var(--success)" : parseFloat(deliveryRate) >= 80 ? "var(--warning)" : "var(--danger)",
                              }}>
                                {deliveryRate}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: (c.open_count || 0) > 0 ? "var(--accent)" : "var(--muted)", fontSize: "0.85rem" }}>
                              {c.open_count || 0}
                            </span>
                            <span style={{ fontSize: "0.65rem", color: "var(--muted)", marginLeft: "0.25rem" }}>({openRate}%)</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.7rem" }}>
                              {c.enable_tracking !== 0 && <span title="Open tracking" style={{ color: "var(--success)" }}>📊</span>}
                              {c.enable_unsubscribe !== 0 && <span title="Unsubscribe link" style={{ color: "var(--success)" }}>🔗</span>}
                              {(c.unsubscribe_count || 0) > 0 && (
                                <span title={`${c.unsubscribe_count} unsubscribes`} style={{ color: "var(--warning)", fontWeight: 600 }}>
                                  {c.unsubscribe_count}✗
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => viewDetails(c)}>
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
