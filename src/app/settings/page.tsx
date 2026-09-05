"use client";

import { useEffect, useState } from "react";

interface BlacklistItem { id: string; email?: string; domain?: string; reason: string; created_at: string; }

// ─── All Settings Overview Tab ──────────────────────────────────
const SETTING_GROUPS: { title: string; rows: { key: string; label: string; secret?: boolean }[] }[] = [
  {
    title: "🌐 General",
    rows: [
      { key: "app_url", label: "App URL (tracking & unsubscribe links)" },
      { key: "theme", label: "Theme" },
      { key: "bulk_confirm_threshold", label: "Bulk send confirmation threshold" },
    ],
  },
  {
    title: "📨 Tracking & Unsubscribe",
    rows: [
      { key: "enable_tracking", label: "Open tracking enabled" },
      { key: "enable_unsubscribe", label: "Unsubscribe links enabled" },
      { key: "webhook_email_recipient", label: "Form submissions forwarded to" },
    ],
  },
  {
    title: "🔔 Notifications & Webhooks",
    rows: [
      { key: "smtp_alerts_enabled", label: "SMTP alerts enabled" },
      { key: "smtp_alert_email", label: "SMTP alert email" },
      { key: "slack_webhook_url", label: "Slack webhook", secret: true },
      { key: "discord_webhook_url", label: "Discord webhook", secret: true },
    ],
  },
  {
    title: "🔐 Security",
    rows: [
      { key: "app_password", label: "App password", secret: true },
      { key: "recovery_code", label: "Recovery code", secret: true },
    ],
  },
];

function OverviewTab({ settings, onSaved }: { settings: Record<string, string>; onSaved: (d: Record<string, string>) => void }) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const listedKeys = new Set(SETTING_GROUPS.flatMap(g => g.rows.map(r => r.key)));
  const extraKeys = Object.keys(settings).filter(
    k => !listedKeys.has(k) && settings[k]
  );

  // Hashed/credential values managed by dedicated flows — not editable as raw text
  const READ_ONLY = new Set(["app_password", "recovery_code"]);

  const startEdit = (key: string) => { setEditingKey(key); setEditValue(settings[key] || ""); };
  const cancelEdit = () => { setEditingKey(null); setEditValue(""); };

  const saveEdit = async (key: string) => {
    setSavingKey(key);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue }),
      });
      if (!res.ok) throw new Error("Save failed");
      const fresh = await fetch("/api/settings").then(r => r.json());
      onSaved(fresh);
      setEditingKey(null);
      setEditValue("");
    } catch {
      alert("Failed to save setting");
    } finally {
      setSavingKey(null);
    }
  };

  const display = (key: string, secret?: boolean) => {
    const v = settings[key];
    if (!v) return "—";
    if (secret && !showSecrets) return "•".repeat(Math.min(v.length, 12));
    return v;
  };

  const renderRow = (key: string, label: string, secret?: boolean) => {
    const isEditing = editingKey === key;
    const readOnly = READ_ONLY.has(key);
    return (
      <tr key={key} style={{ borderBottom: "1px solid var(--border)", background: isEditing ? "rgba(139,92,246,0.05)" : "transparent" }}>
        <td style={{ padding: "0.5rem 0.5rem 0.5rem 0", fontSize: "0.8rem", fontWeight: 500, width: "45%" }}>
          {label}
          {readOnly && <span title="Managed by the password / recovery flow — reset from the login page" style={{ cursor: "help" }}> 🔒</span>}
        </td>
        <td style={{ padding: "0.5rem 0", fontSize: "0.8rem", color: "var(--muted)", wordBreak: "break-all" }}>
          {isEditing ? (
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", width: "100%" }}>
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                autoFocus
                placeholder="Empty value clears the setting"
                style={{ flex: 1, minWidth: 0, padding: "0.35rem 0.5rem", fontSize: "0.8rem", borderRadius: "6px", border: "1px solid var(--accent)", background: "var(--bg-primary)", color: "var(--fg-primary)" }}
                onKeyDown={e => {
                  if (e.key === "Enter") saveEdit(key);
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <button className="btn btn-primary" style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem", whiteSpace: "nowrap" }} disabled={savingKey === key} onClick={() => saveEdit(key)}>
                {savingKey === key ? "Saving…" : "💾 Save"}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }} onClick={cancelEdit}>✖ Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ wordBreak: "break-all" }}>{display(key, secret)}</span>
              {!readOnly && (
                <button className="btn btn-secondary" style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => startEdit(key)}>
                  ✏️ Edit
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={() => setShowSecrets(!showSecrets)} style={{ fontSize: "0.75rem" }}>
          {showSecrets ? "🙈 Hide sensitive values" : "👁️ Show sensitive values"}
        </button>
      </div>

      {SETTING_GROUPS.map(group => (
        <div key={group.title} className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>{group.title}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {group.rows.map(row => renderRow(row.key, row.label, row.secret))}
            </tbody>
          </table>
        </div>
      ))}

      {extraKeys.length > 0 && (
        <div className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>🔧 Other stored settings</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {extraKeys.map(key => renderRow(key, key))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [appUrl, setAppUrl] = useState("");
  const [confirmThreshold, setConfirmThreshold] = useState("1000");
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
  const [activeTab, setActiveTab] = useState<"general" | "smtp" | "blacklist" | "overview" | "about" | "security">("general");
  const [allSettings, setAllSettings] = useState<Record<string, string>>({});
  const [smtpConfigs, setSmtpConfigs] = useState<any[]>([]);
  const [editingSmtp, setEditingSmtp] = useState<any>(null);
  const [showSmtpForm, setShowSmtpForm] = useState(false);
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
      setConfirmThreshold(d.bulk_confirm_threshold || "1000");
      setWebhookEmail(d.webhook_email_recipient || "");
      setSlackWebhook(d.slack_webhook_url || "");
      setDiscordWebhook(d.discord_webhook_url || "");
      setSmtpAlertsEnabled(d.smtp_alerts_enabled === "true");
      setSmtpAlertEmail(d.smtp_alert_email || "");
      setAllSettings(d);
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

  // ── Security: change password ──
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [newRecoveryShown, setNewRecoveryShown] = useState("");

  const pwScore = (() => {
    let s = 0;
    if (newPw.length >= 10) s++;
    if (/[a-z]/.test(newPw) && /[A-Z]/.test(newPw)) s++;
    if (/[0-9]/.test(newPw)) s++;
    if (newPw.length >= 14 && /[^A-Za-z0-9]/.test(newPw)) s++;
    return s;
  })();
  const pwValid = newPw.length >= 10 && /[a-z]/.test(newPw) && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) && newPw === confirmPw;

  const changePassword = async () => {
    if (!pwValid || pwBusy) return;
    setPwBusy(true);
    setPwMessage(null);
    try {
      const res = await fetch("/api/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const d = await res.json();
      if (res.ok) {
        setPwMessage({ ok: true, text: "Password updated. Save your new recovery code below." });
        setNewRecoveryShown(d.recoveryCode || "");
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
      } else {
        setPwMessage({ ok: false, text: d.error || "Password change failed" });
      }
    } catch {
      setPwMessage({ ok: false, text: "Connection error" });
    }
    setPwBusy(false);
  };

  const logoutEverywhere = async () => {
    if (!confirm("Log out all devices? Other browsers/devices will need the password to log in again. This device stays logged in.")) return;
    try {
      const res = await fetch("/api/auth", { method: "PATCH" });
      if (res.ok) {
        setPwMessage({ ok: true, text: "All other sessions have been logged out." });
      } else {
        setPwMessage({ ok: false, text: "Logout failed" });
      }
    } catch {
      setPwMessage({ ok: false, text: "Connection error" });
    }
  };

  const saveTrackingSettings = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "enable_tracking", value: String(enableTracking) }) });
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "enable_unsubscribe", value: String(enableUnsubscribe) }) });
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "webhook_email_recipient", value: webhookEmail }) });
    alert("Tracking settings saved!");
  };

  const fetchSmtpConfigs = async () => {
    try {
      const r = await fetch("/api/smtp");
      if (!r.ok) return;
      const d = await r.json();
      setSmtpConfigs(Array.isArray(d) ? d : d.configs || []);
    } catch (e) {
      console.error("Failed to fetch SMTP configs:", e);
    }
  };

  const [saving, setSaving] = useState(false);

  const saveSmtp = async () => {
    if (!smtpForm.name || !smtpForm.user || !smtpForm.pass) {
      alert("Please fill in Name, Username, and Password");
      return;
    }
    setSaving(true);
    try {
      const method = editingSmtp ? "PUT" : "POST";
      const body = editingSmtp ? { ...smtpForm, id: editingSmtp.id } : smtpForm;
      const res = await fetch("/api/smtp", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Failed to save SMTP: " + (err.error || res.statusText));
        return;
      }
      setEditingSmtp(null);
      setShowSmtpForm(false);
      setSmtpForm({ name: "", host: "smtp.gmail.com", port: 587, user: "", pass: "", from_name: "", from_email: "", daily_limit: 500, hourly_limit: 100, secure: false, enabled: true });
      await fetchSmtpConfigs();
    } catch (e: any) {
      alert("Error saving SMTP: " + e.message);
    } finally {
      setSaving(false);
    }
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
    setShowSmtpForm(true);
    setSmtpForm({ name: config.name || "", host: config.host || "smtp.gmail.com", port: config.port || 587, user: config.user || "", pass: config.pass || "", from_name: config.from_name || "", from_email: config.from_email || "", daily_limit: config.daily_limit || 500, hourly_limit: config.hourly_limit || 100, secure: Boolean(config.secure), enabled: Boolean(config.enabled) });
  };

  const fetchBlacklist = () => {
    fetch("/api/blacklist").then(r => r.json()).then(setBlacklist);
  };

  const saveAppUrl = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "app_url", value: appUrl }) });
    alert("App URL saved!");
  };

  const saveConfirmThreshold = async () => {
    const n = parseInt(confirmThreshold, 10);
    if (isNaN(n) || n < 0) {
      alert("Please enter a valid number (0 to disable, or a minimum count)");
      return;
    }
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "bulk_confirm_threshold", value: String(n) }) });
    alert("Safety threshold saved!");
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
    { id: "overview" as const, label: "📋 All Settings", },
    { id: "security" as const, label: "🔐 Security", },
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
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>🛡️ Bulk Send Safety</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.75rem" }}>Show a confirmation prompt before resuming/retrying a campaign with more than this many queued emails (0 disables the prompt)</p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
              <div style={{ width: "160px" }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Confirmation Threshold</label>
                <input className="input" type="number" min="0" value={confirmThreshold} onChange={e => setConfirmThreshold(e.target.value)} placeholder="1000" />
              </div>
              <button className="btn btn-primary" onClick={saveConfirmThreshold}>Save</button>
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
            <button className="btn btn-primary" onClick={() => { setEditingSmtp(null); setShowSmtpForm(true); setSmtpForm({ name: "", host: "smtp.gmail.com", port: 587, user: "", pass: "", from_name: "", from_email: "", daily_limit: 500, hourly_limit: 100, secure: false, enabled: true }); }}>+ Add SMTP</button>
          </div>

          {/* SMTP Form */}
          {showSmtpForm ? (
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
                <button className="btn btn-primary" onClick={saveSmtp} disabled={saving}>{saving ? "Saving..." : editingSmtp ? "Update" : "Save"}</button>
                <button className="btn btn-secondary" onClick={() => { setEditingSmtp(null); setShowSmtpForm(false); }}>Cancel</button>
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

      {activeTab === "overview" && (
        <OverviewTab settings={allSettings} onSaved={(d) => setAllSettings(d)} />
      )}

      {activeTab === "security" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>🔑 Change Password</h3>
            {pwMessage && (
              <div style={{
                padding: "0.6rem 0.75rem", borderRadius: "0.375rem", marginBottom: "0.75rem", fontSize: "0.8rem",
                background: pwMessage.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${pwMessage.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                color: pwMessage.ok ? "#22c55e" : "#ef4444",
              }}>{pwMessage.ok ? "✅" : "❌"} {pwMessage.text}</div>
            )}
            {newRecoveryShown && (
              <div style={{
                padding: "0.75rem", borderRadius: "0.375rem", marginBottom: "0.75rem", textAlign: "center",
                background: "rgba(15,23,42,0.05)", border: "2px dashed rgba(34,197,94,0.5)",
              }}>
                <div style={{ fontSize: "0.65rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>New Recovery Code — save it now</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "monospace", color: "#16a34a", letterSpacing: "0.08em" }}>{newRecoveryShown}</div>
              </div>
            )}
            <div style={{ display: "grid", gap: "0.75rem", maxWidth: "360px" }}>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>Current password</label>
                <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={{ width: "100%", padding: "0.5rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-primary)" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>New password</label>
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="10+ chars, upper & lowercase, number" style={{ width: "100%", padding: "0.5rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-primary)" }} />
                {newPw && (
                  <div style={{ display: "flex", gap: "0.2rem", marginTop: "0.35rem" }}>
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} style={{ flex: 1, height: "3px", borderRadius: "2px", background: i < pwScore ? ["#ef4444", "#f97316", "#eab308", "#16a34a"][pwScore] : "var(--border)" }} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>Confirm new password</label>
                <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={{ width: "100%", padding: "0.5rem 0.65rem", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-primary)" }} />
                {confirmPw && confirmPw !== newPw && (
                  <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "0.25rem" }}>Passwords do not match</div>
                )}
              </div>
              <button className="btn btn-primary" disabled={!pwValid || pwBusy} onClick={changePassword} style={{ opacity: !pwValid || pwBusy ? 0.6 : 1 }}>
                {pwBusy ? "Updating…" : "Update Password"}
              </button>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                Changing your password generates a new recovery code and keeps this device logged in. Passwords are hashed with salted scrypt.
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>🚪 Sessions</h3>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
              Sessions last 30 days per device. If you left yourself logged in somewhere public,
              use this to invalidate every session — all devices (except this one) will need the password again.
            </p>
            <button className="btn btn-secondary" onClick={logoutEverywhere} style={{ borderColor: "rgba(239,68,68,0.4)", color: "#ef4444", fontSize: "0.8rem" }}>
              🚪 Log Out All Devices
            </button>
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
