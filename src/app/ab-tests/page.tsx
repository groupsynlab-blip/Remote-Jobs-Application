"use client";

import { useEffect, useState } from "react";

interface AbTest {
  id: string;
  campaign_id: string;
  campaign_name: string;
  variant_a_subject: string;
  variant_b_subject: string;
  split_ratio: number;
  status: string;
  winner: string | null;
  test_size: number;
  variant_a_sent: number;
  variant_b_sent: number;
  variant_a_opens: number;
  variant_b_opens: number;
  variant_a_fails: number;
  variant_b_fails: number;
  created_at: string;
}

interface Campaign { id: string; name: string; status: string; }

interface DetailedResult {
  variant_a: { subject: string; sent: number; opens: number; fails: number; open_rate: string };
  variant_b: { subject: string; sent: number; opens: number; fails: number; open_rate: string };
  winner: string | null;
  is_complete: boolean;
}

export default function AbTestsPage() {
  const [tests, setTests] = useState<AbTest[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [variantASubject, setVariantASubject] = useState("");
  const [variantBSubject, setVariantBSubject] = useState("");
  const [variantABody, setVariantABody] = useState("");
  const [variantBBody, setVariantBBody] = useState("");
  const [testSize, setTestSize] = useState(100);
  const [details, setDetails] = useState<DetailedResult | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    fetchTests();
    fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(Array.isArray(d) ? d : d.campaigns || [])).catch(() => {});
  }, []);

  const fetchTests = () => {
    fetch("/api/ab-tests").then(r => r.json()).then(setTests);
  };

  const handleCreate = async () => {
    const res = await fetch("/api/ab-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: selectedCampaign,
        variant_a_subject: variantASubject,
        variant_b_subject: variantBSubject,
        variant_a_body: variantABody,
        variant_b_body: variantBBody,
        test_size: testSize,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      resetForm();
      fetchTests();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this A/B test?")) return;
    await fetch(`/api/ab-tests?id=${id}`, { method: "DELETE" });
    fetchTests();
    if (detailsId === id) { setDetails(null); setDetailsId(null); }
  };

  const loadDetails = async (id: string) => {
    const res = await fetch(`/api/ab-tests/${id}/results`);
    const data = await res.json();
    setDetails(data);
    setDetailsId(id);
  };

  const resetForm = () => {
    setSelectedCampaign(""); setVariantASubject(""); setVariantBSubject("");
    setVariantABody(""); setVariantBBody(""); setTestSize(100);
  };

  const statusColor = (s: string) => {
    if (s === "completed") return { bg: "rgba(34,197,94,0.15)", color: "#22c55e" };
    if (s === "running") return { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" };
    return { bg: "rgba(107,114,128,0.15)", color: "#6b7280" };
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>🔬 A/B Testing</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Split test subject lines and content. Auto-winner selection based on open rates.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          padding: "0.75rem 1.5rem", borderRadius: "0.75rem", border: "none",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
          fontWeight: 600, cursor: "pointer", fontSize: "0.875rem",
        }}>+ New A/B Test</button>
      </div>

      {/* How It Works */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "2rem", background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>📖 How A/B Testing Works</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", fontSize: "0.75rem", color: "var(--muted)" }}>
          <div><strong style={{ color: "var(--foreground)" }}>1. Create</strong><br/>Pick two subject lines/content variants</div>
          <div><strong style={{ color: "var(--foreground)" }}>2. Split</strong><br/>Test size split randomly between A and B</div>
          <div><strong style={{ color: "var(--foreground)" }}>3. Send</strong><br/>Run the campaign — each recipient gets one variant</div>
          <div><strong style={{ color: "var(--foreground)" }}>4. Winner</strong><br/>Auto-selects winner by open rate after 10+ per variant</div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Create A/B Test</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Campaign</label>
              <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="input">
                <option value="">Select campaign...</option>
                {campaigns.filter(c => c.status === "draft" || c.status === "scheduled").map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                Variant A Subject
              </label>
              <input value={variantASubject} onChange={e => setVariantASubject(e.target.value)} className="input"
                placeholder="Get 50% off today!" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                Variant B Subject
              </label>
              <input value={variantBSubject} onChange={e => setVariantBSubject(e.target.value)} className="input"
                placeholder="Exclusive offer just for you" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                Variant A Body (optional)
              </label>
              <textarea value={variantABody} onChange={e => setVariantABody(e.target.value)} className="input"
                rows={3} placeholder="Leave empty to use template body" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                Variant B Body (optional)
              </label>
              <textarea value={variantBBody} onChange={e => setVariantBBody(e.target.value)} className="input"
                rows={3} placeholder="Leave empty to use template body" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                Test Size (emails)
              </label>
              <input type="number" value={testSize} onChange={e => setTestSize(Number(e.target.value))} className="input" min={20} max={10000} />
              <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                How many emails to split between variants. Remaining go to the winner.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button onClick={handleCreate} style={{
              padding: "0.625rem 1.5rem", borderRadius: "0.5rem", border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
              fontWeight: 600, cursor: "pointer",
            }}>Create Test</button>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{
              padding: "0.625rem 1.5rem", borderRadius: "0.5rem",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted)", cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tests List */}
      <div style={{ display: "grid", gap: "1rem" }}>
        {tests.map(test => {
          const sc = statusColor(test.status);
          return (
            <div key={test.id} className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>
                    {test.campaign_name || "Campaign"}
                    {test.winner && (
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#22c55e" }}>
                        🏆 Winner: Variant {test.winner}
                      </span>
                    )}
                  </h3>
                  <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
                    <div>
                      <span style={{ color: "#6366f1", fontWeight: 600 }}>A:</span>{" "}
                      <span style={{ fontStyle: "italic" }}>"{test.variant_a_subject}"</span>
                    </div>
                    <div>
                      <span style={{ color: "#a855f7", fontWeight: 600 }}>B:</span>{" "}
                      <span style={{ fontStyle: "italic" }}>"{test.variant_b_subject}"</span>
                    </div>
                  </div>
                </div>
                <span style={{
                  padding: "0.2rem 0.625rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600,
                  background: sc.bg, color: sc.color, textTransform: "uppercase",
                }}>{test.status}</span>
              </div>

              {/* Split Visualization */}
              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ flex: test.split_ratio, background: "#6366f1" }} />
                  <div style={{ flex: 1 - test.split_ratio, background: "#a855f7" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  <span>Variant A ({(test.split_ratio * 100).toFixed(0)}%)</span>
                  <span>Variant B ({((1 - test.split_ratio) * 100).toFixed(0)}%)</span>
                </div>
              </div>

              {/* Quick Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginTop: "1rem" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#6366f1" }}>{test.variant_a_sent}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>A Sent</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#a855f7" }}>{test.variant_b_sent}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>B Sent</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#22c55e" }}>{test.variant_a_opens + test.variant_b_opens}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Opens</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#ef4444" }}>{test.variant_a_fails + test.variant_b_fails}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Failed</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button onClick={() => loadDetails(test.id)} style={{
                  padding: "0.375rem 0.875rem", borderRadius: "0.375rem", border: "1px solid var(--border)",
                  background: "transparent", fontSize: "0.7rem", cursor: "pointer",
                }}>📊 Detailed Results</button>
                <button onClick={() => handleDelete(test.id)} style={{
                  padding: "0.375rem 0.875rem", borderRadius: "0.375rem", border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "0.7rem", cursor: "pointer",
                }}>🗑️ Delete</button>
              </div>
            </div>
          );
        })}
        {tests.length === 0 && (
          <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔬</p>
            <p>No A/B tests yet. Create one to start split testing!</p>
          </div>
        )}
      </div>

      {/* Detailed Results Modal */}
      {details && detailsId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => { setDetails(null); setDetailsId(null); }}>
          <div style={{
            background: "var(--card)", borderRadius: "1rem", width: "90%", maxWidth: "600px",
            padding: "2rem", position: "relative",
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setDetails(null); setDetailsId(null); }} style={{
              position: "absolute", top: "1rem", right: "1rem", background: "none",
              border: "none", fontSize: "1.25rem", cursor: "pointer",
            }}>✕</button>

            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem" }}>📊 A/B Test Results</h2>

            {/* Winner Banner */}
            {details.winner && (
              <div style={{
                padding: "0.75rem 1rem", borderRadius: "0.5rem", marginBottom: "1.5rem",
                background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                textAlign: "center", fontWeight: 600, color: "#22c55e",
              }}>
                🏆 Winner: Variant {details.winner} — Subject: &quot;{(details as any)[`variant_${details.winner!.toLowerCase()}`].subject}&quot;
              </div>
            )}

            {!details.winner && details.is_complete && (
              <div style={{
                padding: "0.75rem 1rem", borderRadius: "0.5rem", marginBottom: "1.5rem",
                background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
                textAlign: "center", fontSize: "0.8rem", color: "#eab308",
              }}>
                ⏳ Need more data — at least 10 emails per variant with opens to determine a winner
              </div>
            )}

            {/* Comparison Table */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1rem" }}>
              {/* Variant A */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: "0.75rem", fontWeight: 700, color: "#6366f1", textTransform: "uppercase",
                  marginBottom: "0.5rem", letterSpacing: "0.05em",
                }}>Variant A</div>
                <div style={{ fontSize: "0.8rem", fontStyle: "italic", marginBottom: "0.75rem", color: "var(--muted)" }}>
                  &quot;{details.variant_a.subject}&quot;
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#6366f1" }}>
                  {details.variant_a.open_rate}%
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Open Rate</div>
                <div style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                  {details.variant_a.opens} / {details.variant_a.sent} sent
                </div>
                <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>
                  {details.variant_a.fails} failed
                </div>
              </div>

              {/* VS */}
              <div style={{ display: "flex", alignItems: "center", fontSize: "0.875rem", fontWeight: 700, color: "var(--muted)" }}>
                VS
              </div>

              {/* Variant B */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: "0.75rem", fontWeight: 700, color: "#a855f7", textTransform: "uppercase",
                  marginBottom: "0.5rem", letterSpacing: "0.05em",
                }}>Variant B</div>
                <div style={{ fontSize: "0.8rem", fontStyle: "italic", marginBottom: "0.75rem", color: "var(--muted)" }}>
                  &quot;{details.variant_b.subject}&quot;
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "#a855f7" }}>
                  {details.variant_b.open_rate}%
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Open Rate</div>
                <div style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                  {details.variant_b.opens} / {details.variant_b.sent} sent
                </div>
                <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>
                  {details.variant_b.fails} failed
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
