"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
  template_subject: string;
  contact_list_id: string;
  list_name: string;
  status: string;
  delay_seconds: number;
  reply_to: string;
  subject_rotation: string;
  template_rotation: string;
  enable_tracking: number;
  enable_unsubscribe: number;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string;
  log_count: number;
  log_sent: number;
  log_failed: number;
  log_queued: number;
  selected_smtp_ids: string;
}

interface Template { id: string; name: string; subject: string; }
interface List { id: string; name: string; member_count: number; }

const statusColors: Record<string, { bg: string; color: string }> = {
  draft: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  scheduled: { bg: "rgba(147,197,253,0.15)", color: "#60a5fa" },
  sending: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  sent: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  paused: { bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
  completed: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  failed: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Campaign>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [smtpConfigs, setSmtpConfigs] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [campRes, tplRes, listRes, smtpRes] = await Promise.all([
      fetch("/api/campaigns"),
      fetch("/api/templates"),
      fetch("/api/contacts"),
      fetch("/api/smtp"),
    ]);
    const campData = await campRes.json();
    const tplData = await tplRes.json();
    const listData = await listRes.json();
    setCampaigns(Array.isArray(campData) ? campData : []);
    setTemplates(tplData.templates || []);
    setLists(listData.lists || []);
    const smtpDataParsed = await smtpRes.json();
    setSmtpConfigs((Array.isArray(smtpDataParsed) ? smtpDataParsed : (smtpDataParsed.smtps || [])).filter((s: any) => s.enabled));    setLoading(false);
  };

  const startEdit = (c: Campaign) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      template_id: c.template_id,
      contact_list_id: c.contact_list_id,
      delay_seconds: c.delay_seconds,
      reply_to: c.reply_to || "",
      enable_tracking: c.enable_tracking,
      enable_unsubscribe: c.enable_unsubscribe,
      selected_smtp_ids: c.selected_smtp_ids ? JSON.parse(c.selected_smtp_ids) : smtpConfigs.map((s: any) => s.id),    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await fetch(`/api/campaigns/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      loadData();
    } catch (e: any) {
      alert("Failed to save: " + e.message);
    }
    setSaving(false);
  };

  const deleteCampaign = async (id: string) => {
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    loadData();
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.template_name || "").toLowerCase().includes(q) || (c.list_name || "").toLowerCase().includes(q);
    }
    return true;
  });

  const statuses = ["all", "draft", "scheduled", "sending", "sent", "paused", "completed", "failed"];
  const statusCounts = campaigns.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Campaigns</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>Manage, edit, and delete your email campaigns</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {statuses.filter(s => s !== "all").map(s => (
          <div key={s} onClick={() => setFilter(filter === s ? "all" : s)}
            style={{ padding: "0.75rem", background: filter === s ? (statusColors[s]?.bg || "var(--background)") : "var(--card)", borderRadius: "0.5rem", textAlign: "center", cursor: "pointer", border: `1px solid ${filter === s ? (statusColors[s]?.color || "var(--border)") : "var(--border)"}`, transition: "all 0.2s" }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: statusColors[s]?.color || "var(--foreground)" }}>{statusCounts[s] || 0}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "capitalize" }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: "1rem", padding: "0.75rem 1rem" }}>
        <input className="input" placeholder="🔍 Search campaigns by name, template, or list..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%" }} />
      </div>

      {/* Campaigns Table */}
      <div className="card">
        {loading ? (
          <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading campaigns...</p>
        ) : filteredCampaigns.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center" }}>
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</p>
            <p style={{ color: "var(--muted)" }}>{campaigns.length === 0 ? "No campaigns yet. Create one in the Compose page!" : "No campaigns match your filter."}</p>
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
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c) => {
                  const sc = statusColors[c.status] || statusColors.draft;
                  const progress = c.total_count > 0 ? Math.round(((c.log_sent || 0) / c.total_count) * 100) : 0;

                  if (editingId === c.id) {
                    return (
                      <tr key={c.id} style={{ background: "rgba(99,102,241,0.05)" }}>
                        <td colSpan={7} style={{ padding: "1rem" }}>
                          <div style={{ display: "grid", gap: "0.75rem", maxWidth: "600px" }}>
                            <div>
                              <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Campaign Name</label>
                              <input className="input" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                              <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Template</label>
                                <select className="input" value={editForm.template_id || ""} onChange={(e) => setEditForm({ ...editForm, template_id: e.target.value })}>
                                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Contact List</label>
                                <select className="input" value={editForm.contact_list_id || ""} onChange={(e) => setEditForm({ ...editForm, contact_list_id: e.target.value })}>
                                  {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.member_count})</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                              <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Delay (sec)</label>
                                <input className="input" type="number" value={editForm.delay_seconds || 2} onChange={(e) => setEditForm({ ...editForm, delay_seconds: parseInt(e.target.value) || 2 })} />
                              </div>
                              <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Reply-To</label>
                                <input className="input" value={editForm.reply_to || ""} onChange={(e) => setEditForm({ ...editForm, reply_to: e.target.value })} placeholder="Optional" />
                              </div>
                              <div style={{ display: "flex", gap: "1rem", alignItems: "end", paddingBottom: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer" }}>
                                  <input type="checkbox" checked={!!editForm.enable_tracking} onChange={(e) => setEditForm({ ...editForm, enable_tracking: e.target.checked ? 1 : 0 })} /> Track Opens
                                </label>
                                <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer" }}>
                                  <input type="checkbox" checked={!!editForm.enable_unsubscribe} onChange={(e) => setEditForm({ ...editForm, enable_unsubscribe: e.target.checked ? 1 : 0 })} /> Unsubscribe
                                </label>
                              </div>
                            </div>
                            <div style={{ marginTop: "0.5rem" }}>
                              <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>SMTP Accounts</label>
                              <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.25rem" }}>Choose which SMTPs to use. Emails rotate across selected accounts.</p>
                              <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.375rem" }}>
                                <button type="button" className="btn btn-secondary" style={{ fontSize: "0.65rem", padding: "0.2rem 0.5rem" }}
                                  onClick={() => setEditForm({ ...editForm, selected_smtp_ids: smtpConfigs.map((s: any) => s.id) })}>All</button>
                                <button type="button" className="btn btn-secondary" style={{ fontSize: "0.65rem", padding: "0.2rem 0.5rem" }}
                                  onClick={() => setEditForm({ ...editForm, selected_smtp_ids: [] })}>None</button>
                              </div>
                              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                                {smtpConfigs.map((smtp) => (
                                  <label key={smtp.id} style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.7rem",
                                    background: (editForm.selected_smtp_ids || []).includes(smtp.id) ? "rgba(34,197,94,0.1)" : "var(--background)",
                                    border: `1px solid ${(editForm.selected_smtp_ids || []).includes(smtp.id) ? "var(--success)" : "var(--border)"}`, cursor: "pointer" }}>
                                    <input type="checkbox" checked={(editForm.selected_smtp_ids || []).includes(smtp.id)}
                                      onChange={(e) => {
                                        const current = (editForm.selected_smtp_ids as string[]) || [];
                                        const next = e.target.checked ? [...current, smtp.id] : current.filter((id) => id !== smtp.id);
                                        setEditForm({ ...editForm, selected_smtp_ids: next });
                                      }} />
                                    <span>{smtp.name || smtp.from_email || smtp.host}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button className="btn btn-primary" onClick={saveEdit} disabled={saving} style={{ fontSize: "0.8rem" }}>{saving ? "Saving..." : "💾 Save"}</button>
                              <button className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ fontSize: "0.8rem" }}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{c.name}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{c.total_count} recipients · {c.delay_seconds}s delay</div>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{c.template_name || "—"}</td>
                      <td style={{ fontSize: "0.8rem" }}>{c.list_name || "—"}</td>
                      <td>
                        <span style={{ padding: "0.2rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.7rem", fontWeight: 600, background: sc.bg, color: sc.color, textTransform: "capitalize" }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ minWidth: "120px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{ flex: 1, height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${progress}%`, height: "100%", background: progress === 100 ? "var(--success)" : "var(--accent)", borderRadius: "3px", transition: "width 0.3s" }} />
                          </div>
                          <span style={{ fontSize: "0.7rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{c.log_sent || 0}/{c.total_count}</span>
                        </div>
                        {(c.log_failed || 0) > 0 && (
                          <span style={{ fontSize: "0.65rem", color: "var(--danger)" }}>{c.log_failed} failed</span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{formatDate(c.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                          <Link href={`/campaigns/${c.id}`} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", textDecoration: "none" }}>📊 Details</Link>
                          <button className="btn btn-secondary" onClick={() => startEdit(c)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} >✏️ Edit</button>
                          {confirmDelete === c.id ? (
                            <>
                              <button className="btn btn-danger" onClick={() => deleteCampaign(c.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}>Confirm</button>
                              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn btn-danger" onClick={() => setConfirmDelete(c.id)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} >🗑️</button>
                          )}
                        </div>
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
  );
}
