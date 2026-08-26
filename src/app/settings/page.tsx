"use client";

import { useEffect, useState } from "react";

interface BlacklistItem { id: string; email?: string; domain?: string; reason: string; created_at: string; }

export default function SettingsPage() {
  const [appUrl, setAppUrl] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [newBlacklistEmail, setNewBlacklistEmail] = useState("");
  const [newBlacklistDomain, setNewBlacklistDomain] = useState("");
  const [activeTab, setActiveTab] = useState<"general" | "blacklist" | "about">("general");

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => {
      setAppUrl(d.app_url || "");
      setDarkMode(d.theme === "dark");
      if (d.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    });
    fetchBlacklist();
  }, []);

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
