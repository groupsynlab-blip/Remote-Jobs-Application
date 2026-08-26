"use client";

import { useEffect, useState } from "react";

interface BlacklistItem { id: string; email?: string; domain?: string; reason: string; created_at: string; }

export default function SettingsPage() {
  const [appUrl, setAppUrl] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [newBlacklistEmail, setNewBlacklistEmail] = useState("");
  const [newBlacklistDomain, setNewBlacklistDomain] = useState("");
  const [enableTracking, setEnableTracking] = useState(true);
  const [enableUnsubscribe, setEnableUnsubscribe] = useState(true);
  const [webhookEmail, setWebhookEmail] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [smtpAlertsEnabled, setSmtpAlertsEnabled] = useState(false);
  const [smtpAlertEmail, setSmtpAlertEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"general" | "smtp" | "blacklist" | "about">("general");
  const [smtpConfigs, setSmtpConfigs] = useState<any[]>([]);
  const [editingSmtp, setEditingSmtp] = useState<any>(null);
  const [smtpForm, setSmtpForm] = useState({ name: "", host: "smtp.gmail.com", port: 587, user: "", pass: "", from_name: "", from_email: "", daily_limit: 500, hourly_limit: 100, secure: false, enabled: true });

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => {
      setAppUrl(d.app_url || "");
      setDarkMode(d.theme === "dark");
      if (d.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    });
    fetchBlacklist();
    fetchSmtpConfigs();
    fetch("/api/settings").then(r => r.json()).then(d => {
      setEnableTracking(d.enable_tracking !== "false");
      setEnableUnsubscribe(d.enable_unsubscribe !== "false");
      setWebhookEmail(d.webhook_email_recipient || "");
      setSlackWebhook(d.slack_webhook_url || "");
      setDiscordWebhook(d.discord_webhook_url || "");
      setSmtpAlertsEnabled(d.smtp_alerts_enabled === "true");
      setSmtpAlertEmail(d.smtp_alert_email || "");
    });
  }, []);

  const saveWebhookSettings = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "slack_webhook_url", value: slackWebhook }) });
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "discord_webhook_url", value: discordWebhook }) });
    alert("Webhook settings saved!");
  };

  const saveAlertSettings = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "smtp_alerts_enabled", value: String(smtpAlertsEnabled) }) });
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "smtp_alert_email", value: smtpAlertEmail }) });
    alert("Alert settings saved!");
  };

  const saveTrackingSettings = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "enable_tracking", value: String(enableTracking) }) });
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "enable_unsubscribe", value: String(enableUnsubscribe) }) });
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "webhook_email_recipient", value: webhookEmail }) });
    alert("Tracking settings saved!");
  };

  const fetchSmtpConfigs = () => {
    fetch("/api/smtp").then(r => r.json()).then(d => setSmtpConfigs(Array.isArray(d) ? d : d.configs || []));
  };

  const saveSmtp = async () => {
    const method = editingSmtp ? "PUT" : "POST";
    const body = editingSmtp ? { ...smtpForm, id: editingSmtp.id } : smtpForm;
    await fetch("/api/smtp", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setEditingSmtp(null);
    setSmtpForm({ name: "", host: "smtp.gmail.com", port: 587, user: "", pass: "", from_name: "", from_email: "", daily_limit: 500, hourly_limit: 100, secure: false, enabled: true });
    fetchSmtpConfigs();
  };

  const deleteSmtp = async (id: string) => {
    if (!confirm("Delete this SMTP config?")) return;
    await fetch(`/api/smtp?id=${id}`, { method: "DELETE" });
    fetchSmtpConfigs();
  };

  const toggleSmtp = async (id: string) => {
    await fetch("/api/smtp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", id }) });
    fetchSmtpConfigs();
  };

  const editSmtp = (config: any) => {
    setEditingSmtp(config);
    setSmtpForm({ name: config.name || "", host: config.host || "smtp.gmail.com", port: config.port || 587, user: config.user || "", pass: config.pass || "", from_name: config.from_name || "", from_email: config.from_email || "", daily_limit: config.daily_limit || 500, hourly_limit: config.hourly_limit || 100, secure: Boolean(config.secure), enabled: Boolean(config.enabled) });
  };

  const fetchBlacklist = () => {
    fetch("/api/blacklist").then(r => r.json()).then(setBlacklist);
  };

  const saveAppUrl = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "app_url", value: appUrl }) });
    alert("App URL saved!");
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "theme", value: next ? "dark" : "light" }) });
  };

  const addToBlacklist = async (type: "email" | "domain") => {
    const value = type === "email" ? newBlacklistEmail : newBlacklistDomain;
    if (!value.trim()) return;
    await fetch("/api/blacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [type]: value.trim(), reason: "manual" }) });
    if (type === "email") setNewBlacklistEmail(""); else setNewBlacklistDomain("");
    fetchBlacklist();
  };

  const removeFromBlacklist = async (id: string) => {
    await fetch(`/api/blacklist?id=${id}`, { method: "DELETE" });
    fetchBlacklist();
  };

  const tabs = [
    { id: "general" as const, label: "⚙️ General", },
    { id: "smtp" as const, label: "📧 SMTP", },
    { id: "blacklist" as const, label: "🚫 Blacklist", },
    { id: "about" as const, label: "ℹ️ About", },
  ];

  return (
    <div style={{ maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Settings</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none", cursor: "pointer",
            background: activeTab === t.id ? "var(--accent)" : "var(--bg-card-solid)",
            color: activeTab === t.id ? "#fff" : "var(--fg-secondary)",
            fontWeight: 600, fontSize: "0.8rem",
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.875rem" }}>App URL (for Open Tracking & Unsubscribe)</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="https://your-app.up.railway.app" />
              <button className="btn btn-primary" onClick={saveAppUrl}>Save</button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>🔔 SMTP Alerts</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.75rem" }}>Get email alerts when SMTP accounts hit limits or fail to connect</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Enable SMTP Alerts</div>
                <p style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Alerts for daily/hourly limit hits and connection failures</p>
              </div>
              <button onClick={() => setSmtpAlertsEnabled(!smtpAlertsEnabled)} style={{
                width: "48px", height: "26px", borderRadius: "13px", border: "none",
                background: smtpAlertsEnabled ? "#10b981" : "var(--border)", cursor: "pointer",
                position: "relative", transition: "background 0.2s",
              }}>
                <span style={{
                  position: "absolute", top: "3px", left: smtpAlertsEnabled ? "25px" : "3px",
                  width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
            {smtpAlertsEnabled && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Alert Email</label>
                  <input className="input" value={smtpAlertEmail} onChange={e => setSmtpAlertEmail(e.target.value)} placeholder="your@email.com" />
                </div>
                <button className="btn btn-primary" onClick={saveAlertSettings} style={{ height: "36px" }}>Save Alerts</button>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>🌙 Dark Mode</div>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Switch between light and dark theme</p>
              </div>
              <button onClick={toggleDarkMode} style={{
                width: "48px", height: "26px", borderRadius: "13px", border: "none",
                background: darkMode ? "var(--accent)" : "var(--border)", cursor: "pointer",
                position: "relative", transition: "background 0.2s",
              }}>
                <span style={{
                  position: "absolute", top: "3px", left: darkMode ? "25px" : "3px",
                  width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "smtp" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontWeight: 600 }}>SMTP Configurations</h3>
            <button className="btn btn-primary" onClick={() => { setEditingSmtp(null); setSmtpForm({ name: "", host: "smtp.gmail.com", port: 587, user: "", pass: "", from_name: "", from_email: "", daily_limit: 500, hourly_limit: 100, secure: false, enabled: true }); }}>+ Add SMTP</button>
          </div>

          {/* SMTP Form */}
          {editingSmtp !== null || document.querySelector('[data-show-smtp-form]') ? (
            <div style={{ padding: "1rem", borderRadius: "0.75rem", border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
              <h4 style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.875rem" }}>{editingSmtp ? "Edit SMTP" : "Add SMTP"}</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Name</label><input className="input" value={smtpForm.name} onChange={e => setSmtpForm({...smtpForm, name: e.target.value})} placeholder="Gmail SMTP" /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Host</label><input className="input" value={smtpForm.host} onChange={e => setSmtpForm({...smtpForm, host: e.target.value})} /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Port</label><input className="input" type="number" value={smtpForm.port} onChange={e => setSmtpForm({...smtpForm, port: Number(e.target.value)})} /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Username</label><input className="input" value={smtpForm.user} onChange={e => setSmtpForm({...smtpForm, user: e.target.value})} /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Password</label><input className="input" type="password" value={smtpForm.pass} onChange={e => setSmtpForm({...smtpForm, pass: e.target.value})} /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>From Name</label><input className="input" value={smtpForm.from_name} onChange={e => setSmtpForm({...smtpForm, from_name: e.target.value})} placeholder="Bulk Emailer" /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>From Email</label><input className="input" value={smtpForm.from_email} onChange={e => setSmtpForm({...smtpForm, from_email: e.target.value})} /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Daily Limit</label><input className="input" type="number" value={smtpForm.daily_limit} onChange={e => setSmtpForm({...smtpForm, daily_limit: Number(e.target.value)})} /></div>
                <div><label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Hourly Limit</label><input className="input" type="number" value={smtpForm.hourly_limit} onChange={e => setSmtpForm({...smtpForm, hourly_limit: Number(e.target.value)})} /></div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button className="btn btn-primary" onClick={saveSmtp}>{editingSmtp ? "Update" : "Save"}</button>
                <button className="btn btn-secondary" onClick={() => setEditingSmtp(null)}>Cancel</button>
              </div>
            </div>
          ) : null}

          {/* SMTP List */}
          {smtpConfigs.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No SMTP configs yet. Add one to start sending!</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {smtpConfigs.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border)", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.enabled ? "#10b981" : "#ef4444", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{c.from_email} • {c.host}:{c.port} • {c.daily_limit}/day, {c.hourly_limit}/hr</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button onClick={() => toggleSmtp(c.id)} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.375rem", border: "none", fontSize: "0.7rem", cursor: "pointer", background: c.enabled ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", color: c.enabled ? "#ef4444" : "#10b981" }}>{c.enabled ? "Disable" : "Enable"}</button>
                    <button onClick={() => editSmtp(c)} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.375rem", border: "1px solid var(--border)", background: "transparent", fontSize: "0.7rem", cursor: "pointer" }}>Edit</button>
                    <button onClick={() => deleteSmtp(c.id)} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.375rem", border: "none", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "0.7rem", cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "blacklist" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Block Emails</h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" value={newBlacklistEmail} onChange={e => setNewBlacklistEmail(e.target.value)} placeholder="email@example.com" />
              <button className="btn btn-primary" onClick={() => addToBlacklist("email")}>Block</button>
            </div>
          </div>

          <div>
            <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Block Domains</h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" value={newBlacklistDomain} onChange={e => setNewBlacklistDomain(e.target.value)} placeholder="example.com" />
              <button className="btn btn-primary" onClick={() => addToBlacklist("domain")}>Block</button>
            </div>
          </div>

          <div>
            <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Blocked ({blacklist.length})</h3>
            {blacklist.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No blocked emails or domains</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {blacklist.map(b => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)", fontSize: "0.8rem" }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{b.email || b.domain}</span>
                      <span style={{ color: "var(--muted)", marginLeft: "0.5rem", fontSize: "0.7rem" }}>{b.reason}</span>
                    </div>
                    <button onClick={() => removeFromBlacklist(b.id)} style={{ border: "none", background: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "about" && (
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Bulk Emailer</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Version 2.0 — Built with Next.js</p>
          <div style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
            <div>📧 Email sending with SMTP rotation</div>
            <div>🔬 A/B testing with auto-winner</div>
            <div>🕷️ Email scraper (DuckDuckGo, Bing, Brave)</div>
            <div>✅ Email verification</div>
            <div>🔥 Email warmup with auto-ramp</div>
            <div>📊 Campaign analytics</div>
            <div>🌐 Landing page builder</div>
            <div>🌙 Dark mode</div>
            <div>⌨️ Keyboard shortcuts (Ctrl+K)</div>
            <div>🚫 Email blacklist</div>
            <div>🔄 Auto-resume after SMTP limits</div>
          </div>
        </div>
      )}
    </div>
  );
}
