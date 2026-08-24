"use client";

import { useEffect, useState } from "react";

const COLORS = { sent: "#22c55e", failed: "#ef4444", opened: "#6366f1" };

// ─── Donut Chart ───────────────────────────────────────────────
function DonutChart({ segments, size = 120 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#d4d4d8", opacity: 0.3 }} />;

  let cumulative = 0;
  const gradientParts: string[] = [];
  for (const seg of segments) {
    const start = (cumulative / total) * 360;
    cumulative += seg.value;
    const end = (cumulative / total) * 360;
    gradientParts.push(`${seg.color} ${start}deg ${end}deg`);
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `conic-gradient(${gradientParts.join(", ")})`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: size * 0.6, height: size * 0.6, borderRadius: "50%",
        background: "#ffffff", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: "1rem", fontWeight: 700 }}>{total.toLocaleString()}</div>
        <div style={{ fontSize: "0.55rem", color: "#71717a" }}>Total</div>
      </div>
    </div>
  );
}

// ─── Bar Chart (daily volume) ──────────────────────────────────
function DailyBarChart({ data }: { data: { day: string; sent: number; failed: number }[] }) {
  if (data.length === 0) return <div style={{ fontSize: "0.7rem", color: "#71717a", textAlign: "center", padding: "1rem" }}>No send data</div>;
  const maxVal = Math.max(...data.map(d => d.sent + d.failed), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "60px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
          <div style={{
            width: "100%", borderRadius: "2px 2px 0 0", display: "flex", flexDirection: "column",
            justifyContent: "flex-end", height: "50px",
          }}>
            <div style={{
              width: "100%", height: `${(d.failed / maxVal) * 50}px`,
              background: COLORS.failed, borderRadius: d.sent === 0 ? "2px 2px 0 0" : 0,
            }} />
            <div style={{
              width: "100%", height: `${(d.sent / maxVal) * 50}px`,
              background: COLORS.sent, borderRadius: d.failed === 0 ? "2px 2px 0 0" : 0,
            }} />
          </div>
          <div style={{ fontSize: "0.5rem", color: "#71717a" }}>{d.day.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────
function HealthBadge({ rate }: { rate: number }) {
  const color = rate >= 95 ? "#22c55e" : rate >= 80 ? "#eab308" : "#ef4444";
  const label = rate >= 95 ? "Healthy" : rate >= 80 ? "Warning" : "Critical";
  return (
    <span style={{
      padding: "0.125rem 0.5rem", borderRadius: "0.75rem", fontSize: "0.65rem",
      fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function SmtpHealthPage() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/smtp/health")
      .then(r => r.json())
      .then(data => { setConfigs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Aggregate totals
  const totalSent = configs.reduce((s, c) => s + (c.total_sent || 0), 0);
  const totalFailed = configs.reduce((s, c) => s + (c.total_failed || 0), 0);
  const totalOpened = configs.reduce((s, c) => s + (c.total_opened || 0), 0);
  const overallRate = totalSent + totalFailed > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>SMTP Health</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>Deliverability rates and performance per SMTP configuration</p>
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
      ) : configs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--muted)" }}>No SMTP configurations found.</p>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>Go to Settings to add an SMTP config.</p>
        </div>
      ) : (
        <>
          {/* ─── Overall Summary ──────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{configs.length}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>SMTP Configs</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>{totalSent.toLocaleString()}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Emails Sent</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--danger)" }}>{totalFailed.toLocaleString()}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Failed</div>
            </div>
            <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: overallRate === "100.0" ? "var(--success)" : parseFloat(overallRate) >= 90 ? "var(--warning)" : "var(--danger)" }}>
                {overallRate}%
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Overall Delivery</div>
            </div>
          </div>

          {/* ─── Per-Config Cards ─────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {configs.map((config) => {
              const deliveryRate = parseFloat(config.delivery_rate);
              const openRate = parseFloat(config.open_rate);
              const total = config.total_sent + config.total_failed;

              return (
                <div key={config.id} className="card" style={{ padding: "1.5rem" }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{config.name || config.from_email}</h2>
                        <HealthBadge rate={deliveryRate} />
                        {!config.enabled && (
                          <span style={{ fontSize: "0.65rem", padding: "0.125rem 0.375rem", borderRadius: "0.5rem", background: "#a1a1aa18", color: "#71717a", border: "1px solid #a1a1aa40" }}>
                            Disabled
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                        {config.host}:{config.port} • {config.from_name} &lt;{config.from_email}&gt;
                      </p>
                    </div>
                    {config.last_sent_at && (
                      <div style={{ fontSize: "0.65rem", color: "var(--muted)", textAlign: "right" }}>
                        Last used: {new Date(config.last_sent_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Stats + Chart row */}
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "1.5rem", alignItems: "start" }}>
                    {/* Donut + metrics */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <DonutChart
                        segments={[
                          { label: "Sent", value: config.total_sent, color: COLORS.sent },
                          { label: "Failed", value: config.total_failed, color: COLORS.failed },
                        ]}
                        size={120}
                      />
                      <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.65rem" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.sent, display: "inline-block" }} />
                          {config.total_sent}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.failed, display: "inline-block" }} />
                          {config.total_failed}
                        </span>
                      </div>
                    </div>

                    {/* Right side: metrics + chart */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {/* Key metrics row */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
                        <div style={{ padding: "0.5rem", borderRadius: "0.375rem", background: "#22c55e0d", textAlign: "center" }}>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--success)" }}>{config.delivery_rate}%</div>
                          <div style={{ fontSize: "0.55rem", color: "var(--muted)" }}>Delivery</div>
                        </div>
                        <div style={{ padding: "0.5rem", borderRadius: "0.375rem", background: "#6366f10d", textAlign: "center" }}>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent)" }}>{config.open_rate}%</div>
                          <div style={{ fontSize: "0.55rem", color: "var(--muted)" }}>Open Rate</div>
                        </div>
                        <div style={{ padding: "0.5rem", borderRadius: "0.375rem", background: "#a1a1aa0d", textAlign: "center" }}>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--muted)" }}>{config.emails_sent.toLocaleString()}</div>
                          <div style={{ fontSize: "0.55rem", color: "var(--muted)" }}>Total Lifetime</div>
                        </div>
                        <div style={{ padding: "0.5rem", borderRadius: "0.375rem", background: config.hourly_used > 0 ? "#eab3080d" : "#a1a1aa0d", textAlign: "center" }}>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: config.hourly_used > 0 ? "var(--warning)" : "var(--muted)" }}>
                            {config.hourly_used}{config.hourly_limit > 0 ? `/${config.hourly_limit}` : ""}
                          </div>
                          <div style={{ fontSize: "0.55rem", color: "var(--muted)" }}>Hourly</div>
                        </div>
                      </div>

                      {/* Daily volume chart */}
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.375rem" }}>📈 Last 7 Days</div>
                        <DailyBarChart data={config.daily_volume || []} />
                      </div>

                      {/* Error breakdown */}
                      {config.errors && config.errors.length > 0 && (
                        <div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.375rem", color: "var(--danger)" }}>
                            ⚠️ Top Errors ({config.total_failed} total)
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            {config.errors.slice(0, 3).map((err: any, i: number) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.65rem" }}>
                                <div style={{
                                  height: "4px", borderRadius: "2px", background: COLORS.failed,
                                  width: `${(err.count / config.total_failed) * 100}%`, maxWidth: "80px", minWidth: "4px",
                                  opacity: 0.7, flexShrink: 0,
                                }} />
                                <span style={{ color: "var(--danger)", fontWeight: 600, minWidth: "20px" }}>{err.count}</span>
                                <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {err.error_message?.length > 50 ? err.error_message.substring(0, 50) + "..." : err.error_message}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
