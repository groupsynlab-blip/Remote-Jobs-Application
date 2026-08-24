"use client";

import { useEffect, useState } from "react";

interface RateUsage {
  hourly_used: number;
  daily_used: number;
}

interface SmtpItem {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: number;
  user: string;
  pass: string;
  from_name: string;
  from_email: string;
  enabled: number;
  daily_limit: number;
  hourly_limit: number;
  emails_sent: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  rate_usage?: RateUsage;
}

const emptyForm: Partial<SmtpItem> = {
  name: "",
  host: "",
  port: 587,
  secure: 0,
  user: "",
  pass: "",
  from_name: "",
  from_email: "",
  enabled: 1,
  daily_limit: 0,
  hourly_limit: 0,
};

function RateBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = pct >= 80;
  const isAtLimit = pct >= 100;
  const barColor = isAtLimit ? "var(--danger)" : isNearLimit ? "var(--warning)" : "var(--accent)";

  if (limit === 0) {
    return (
      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
        {label}: {used} sent (no limit)
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ color: isAtLimit ? "var(--danger)" : isNearLimit ? "var(--warning)" : "var(--foreground)" }}>
          {used} / {limit} {isAtLimit && "⚠️"}
        </span>
      </div>
      <div style={{ width: "100%", height: "0.375rem", background: "var(--card-border)", borderRadius: "9999px" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: barColor,
          borderRadius: "9999px",
          transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [configs, setConfigs] = useState<SmtpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SmtpItem | null>(null);
  const [form, setForm] = useState<Partial<SmtpItem>>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState("");
  const [appUrlSaving, setAppUrlSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadSettings();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    const res = await fetch("/api/smtp");
    const data = await res.json();
    setConfigs(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const loadSettings = async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setAppUrl(data.app_url || "");
  };

  const saveAppUrl = async () => {
    setAppUrlSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_url: appUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("✅ App URL saved! New campaigns will use this URL for open tracking.");
      }
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    }
    setAppUrlSaving(false);
  };

  const handleSave = async () => {
    if (!form.host || !form.user || !form.from_email) {
      setMessage("Error: Host, Username, and From Email are required");
      return;
    }
    setSaving(true);
    setMessage(null);

    try {
      const isEdit = !!editing;
      const res = await fetch("/api/smtp", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editing?.id }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ SMTP config ${isEdit ? "updated" : "added"} successfully!`);
        setShowForm(false);
        setEditing(null);
        setForm({ ...emptyForm });
        loadConfigs();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    }
    setSaving(false);
  };

  const handleEdit = (config: SmtpItem) => {
    setEditing(config);
    setForm({ ...config });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this SMTP configuration?")) return;
    await fetch(`/api/smtp?id=${id}`, { method: "DELETE" });
    loadConfigs();
  };

  const handleToggle = async (id: string) => {
    await fetch("/api/smtp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id }),
    });
    loadConfigs();
  };

  const handleResetCounters = async (id: string) => {
    if (!confirm("Reset send counters and rate tracking for this SMTP config?")) return;
    await fetch("/api/smtp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_counters", id }),
    });
    loadConfigs();
  };

  const enabledCount = configs.filter((c) => c.enabled).length;
  const totalSent = configs.reduce((sum, c) => sum + c.emails_sent, 0);

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Settings</h1>
          <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
            Configure your app URL, SMTP servers, and deliverability
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setForm({ ...emptyForm });
            setEditing(null);
            setShowForm(!showForm);
          }}
        >
          {showForm ? "✕ Cancel" : "➕ Add SMTP Server"}
        </button>
      </div>

      {/* App URL Setting */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          🌐 App URL (Required for Open Tracking & Unsubscribe)
        </h2>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Email tracking and unsubscribe links need a URL that recipients can reach from the internet. By default, the app uses <code>localhost:3000</code> which won&apos;t work for external recipients.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            className="input"
            placeholder="https://yourdomain.com or http://your-ip:3000"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={saveAppUrl}
            disabled={appUrlSaving}
            style={{ flexShrink: 0 }}
          >
            {appUrlSaving ? "Saving..." : "💾 Save URL"}
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem" }}>
          Examples: <code>https://mail.yourcompany.com</code>, <code>http://192.168.1.100:3000</code>, or use a tunnel like <code>ngrok</code> for local testing.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{configs.length}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Total Servers</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>{enabledCount}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Enabled</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{totalSent.toLocaleString()}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Emails Sent</div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            {editing ? "✏️ Edit SMTP Server" : "➕ Add New SMTP Server"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Label / Name
              </label>
              <input
                className="input"
                placeholder="e.g., Gmail Primary, SendGrid Backup"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                SMTP Host *
              </label>
              <input
                className="input"
                placeholder="smtp.gmail.com"
                value={form.host || ""}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                  Port
                </label>
                <input
                  className="input"
                  type="number"
                  value={form.port || 587}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                  Security
                </label>
                <select
                  className="input"
                  value={form.secure ? "1" : "0"}
                  onChange={(e) => setForm({ ...form, secure: parseInt(e.target.value) })}
                >
                  <option value="0">STARTTLS (port 587)</option>
                  <option value="1">SSL/TLS (port 465)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Username *
              </label>
              <input
                className="input"
                placeholder="your-email@gmail.com"
                value={form.user || ""}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Password / App Password
              </label>
              <input
                className="input"
                type="password"
                placeholder="Your SMTP password or app password"
                value={form.pass || ""}
                onChange={(e) => setForm({ ...form, pass: e.target.value })}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>Sender Info</h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                  From Name
                </label>
                <input
                  className="input"
                  placeholder="My Company"
                  value={form.from_name || ""}
                  onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                  From Email *
                </label>
                <input
                  className="input"
                  placeholder="hello@mycompany.com"
                  value={form.from_email || ""}
                  onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>📊 Rate Limits</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
                Set to 0 for unlimited. Rate-limited servers are automatically skipped during rotation.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                  Hourly Limit
                </label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="0 = unlimited"
                  value={form.hourly_limit || ""}
                  onChange={(e) => setForm({ ...form, hourly_limit: parseInt(e.target.value) || 0 })}
                />
                <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Max emails per hour. Gmail: ~500, SendGrid: ~100
                </p>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                  Daily Limit
                </label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="0 = unlimited"
                  value={form.daily_limit || ""}
                  onChange={(e) => setForm({ ...form, daily_limit: parseInt(e.target.value) || 0 })}
                />
                <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Max emails per day. Gmail: ~2000, Outlook: ~10000
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editing ? "💾 Update Server" : "💾 Add Server"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowForm(false); setEditing(null); setForm({ ...emptyForm }); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
            background: message.startsWith("Error") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
            color: message.startsWith("Error") ? "var(--danger)" : "var(--success)",
          }}
        >
          {message}
        </div>
      )}

      {/* SMTP Configs List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {loading ? (
          <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
        ) : configs.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>No SMTP servers configured yet.</p>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Add at least one SMTP server to start sending emails.
            </p>
          </div>
        ) : (
          configs.map((config) => {
            const usage = config.rate_usage || { hourly_used: 0, daily_used: 0 };
            return (
              <div
                key={config.id}
                className="card"
                style={{
                  opacity: config.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "1rem", fontWeight: 600 }}>
                        {config.name || config.host}
                      </span>
                      <span className={`badge ${config.enabled ? "badge-sent" : "badge-draft"}`}>
                        {config.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                      <div>
                        <span>Host: </span>
                        <span style={{ color: "var(--foreground)" }}>{config.host}:{config.port}</span>
                      </div>
                      <div>
                        <span>User: </span>
                        <span style={{ color: "var(--foreground)" }}>{config.user}</span>
                      </div>
                      <div>
                        <span>From: </span>
                        <span style={{ color: "var(--foreground)" }}>&quot;{config.from_name}&quot; &lt;{config.from_email}&gt;</span>
                      </div>
                    </div>

                    {/* Rate limit usage bars */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxWidth: "400px" }}>
                      <RateBar label="Hourly" used={usage.hourly_used} limit={config.hourly_limit} />
                      <RateBar label="Daily" used={usage.daily_used} limit={config.daily_limit} />
                    </div>

                    <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" }}>
                      <div>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{config.emails_sent.toLocaleString()}</span> total sent
                      </div>
                      {config.last_used_at && (
                        <div>Last used: {new Date(config.last_used_at).toLocaleString()}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0, marginLeft: "1rem" }}>
                    <button
                      className={`btn ${config.enabled ? "btn-secondary" : "btn-success"}`}
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleToggle(config.id)}
                    >
                      {config.enabled ? "⏸ Disable" : "▶ Enable"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleEdit(config)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleResetCounters(config.id)}
                      title="Reset send counters and rate tracking"
                    >
                      🔄 Reset
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleDelete(config.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rotation info */}
      {configs.length > 1 && enabledCount > 1 && (
        <div
          className="card"
          style={{ marginTop: "1.5rem", background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.2)" }}
        >
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            🔄 SMTP Rotation Active
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            With {enabledCount} enabled servers, emails are distributed in round-robin order.
            Rate-limited servers are automatically skipped, and load shifts to remaining servers.
            When all servers hit their limits, sending pauses until quotas reset.
          </p>
        </div>
      )}

      {/* ── Deliverability Tips ── */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          🛡️ Email Deliverability — SPF, DKIM &amp; DMARC
        </h2>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
          Setting up these DNS records is <strong>critical</strong> for inbox placement. Without them, your emails will likely land in spam or be rejected entirely.
        </p>

        {/* SPF */}
        <div style={{ marginBottom: "1.25rem", padding: "0.875rem", background: "var(--background)", borderRadius: "0.5rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.375rem" }}>
            1️⃣ SPF (Sender Policy Framework)
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
            SPF tells receiving mail servers which IPs are authorized to send email on behalf of your domain. Add a <strong>TXT record</strong> to your DNS:
          </p>
          <div style={{ padding: "0.625rem 0.75rem", background: "#1e293b", borderRadius: "0.375rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#e2e8f0", overflowX: "auto" }}>
            v=spf1 include:_spf.google.com ~all
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem", lineHeight: 1.5 }}>
            Replace <code>include:_spf.google.com</code> with your SMTP provider&apos;s SPF include. Common ones:
          </p>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem", lineHeight: 1.8 }}>
            <div>• <strong>Gmail/Workspace:</strong> <code>include:_spf.google.com</code></div>
            <div>• <strong>Microsoft 365:</strong> <code>include:spf.protection.outlook.com</code></div>
            <div>• <strong>SendGrid:</strong> <code>include:sendgrid.net</code></div>
            <div>• <strong>Amazon SES:</strong> <code>include:amazonses.com</code></div>
          </div>
        </div>

        {/* DKIM */}
        <div style={{ marginBottom: "1.25rem", padding: "0.875rem", background: "var(--background)", borderRadius: "0.5rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.375rem" }}>
            2️⃣ DKIM (DomainKeys Identified Mail)
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
            DKIM adds a digital signature to your emails, proving they weren&apos;t tampered with in transit. Your SMTP provider generates the key pair — you publish the public key as a <strong>TXT record</strong> in your DNS:
          </p>
          <div style={{ padding: "0.625rem 0.75rem", background: "#1e293b", borderRadius: "0.375rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#e2e8f0", overflowX: "auto" }}>
            s._domainkey.yourdomain.com TXT "v=DKIM1; k=rsa; p=MIGfMA0GCSq..." 
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem", lineHeight: 1.5 }}>
            <strong>How to get your DKIM key:</strong> Go to your SMTP provider&apos;s dashboard (Gmail Admin, SendGrid Settings, AWS SES console) and generate/select a DKIM signing key. They will give you the DNS record to add.
          </p>
        </div>

        {/* DMARC */}
        <div style={{ marginBottom: "1.25rem", padding: "0.875rem", background: "var(--background)", borderRadius: "0.5rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.375rem" }}>
            3️⃣ DMARC (Domain-based Message Authentication, Reporting &amp; Conformance)
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
            DMARC tells receiving servers what to do when SPF/DKIM fail, and gives you reporting. Add a <strong>TXT record</strong> for <code>_dmarc.yourdomain.com</code>:
          </p>
          <div style={{ padding: "0.625rem 0.75rem", background: "#1e293b", borderRadius: "0.375rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#e2e8f0", overflowX: "auto" }}>
            _dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100"
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem", lineHeight: 1.5 }}>
            <strong>Start with <code>p=none</code></strong> to monitor without blocking, then move to <code>p=quarantine</code> or <code>p=reject</code> once you confirm legitimate mail passes.
          </p>
        </div>

        {/* Additional tips */}
        <div style={{ padding: "0.875rem", background: "rgba(34, 197, 94, 0.05)", borderRadius: "0.5rem", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            ✅ Additional Deliverability Tips
          </h3>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.8 }}>
            <div>• <strong>Warm up new domains/IPs</strong> — start with 20-50 emails/day, increase gradually over 2-4 weeks</div>
            <div>• <strong>Maintain clean lists</strong> — remove bounces and inactive addresses regularly</div>
            <div>• <strong>Use double opt-in</strong> — confirm subscribers via email before adding them</div>
            <div>• <strong>Keep complaint rate below 0.1%</strong> — monitor via Google Postmaster Tools</div>
            <div>• <strong>Use a consistent &quot;From&quot; address</strong> — changing it frequently hurts reputation</div>
            <div>• <strong>Include physical address</strong> — required by CAN-SPAM Act</div>
            <div>• <strong>Monitor blacklists</strong> — check at mxtoolbox.com if deliverability drops</div>
            <div>• <strong>Use Google Postmaster Tools</strong> — free dashboard showing your domain reputation with Gmail</div>
          </div>
        </div>
      </div>

      {/* Webhook Notifications */}
      <WebhookSettings />

      {/* Change Password */}
      <ChangePassword />

      {/* Reference */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Common SMTP Limits
        </h3>
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", display: "grid", gap: "0.25rem" }}>
          <div><strong>Gmail (free):</strong> 500/day, ~100/hour</div>
          <div><strong>Gmail (Workspace):</strong> 2,000/day</div>
          <div><strong>Outlook 365:</strong> 10,000/day</div>
          <div><strong>SendGrid (free):</strong> 100/day</div>
          <div><strong>SendGrid (paid):</strong> varies by plan</div>
          <div><strong>Amazon SES:</strong> 200/day (sandbox), 50,000/day (production)</div>
        </div>
      </div>
    </div>
  );
}

function WebhookSettings() {
  const [enabled, setEnabled] = useState(false);
  const [slackUrl, setSlackUrl] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(data => {
      setEnabled(data.webhook_enabled === "true");
      setSlackUrl(data.webhook_slack_url || "");
      setDiscordUrl(data.webhook_discord_url || "");
      setEmailRecipient(data.webhook_email_recipient || "");
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_enabled: String(enabled),
          webhook_slack_url: slackUrl,
          webhook_discord_url: discordUrl,
          webhook_email_recipient: emailRecipient,
        }),
      });
      if (res.ok) {
        setMsg({ type: "ok", text: "Webhook settings saved!" });
      } else {
        setMsg({ type: "err", text: "Failed to save" });
      }
    } catch {
      setMsg({ type: "err", text: "Connection error" });
    }
    setLoading(false);
  };

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
          🔔 Webhook Notifications
        </h3>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.8rem" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }}
          />
          <span style={{ color: enabled ? "var(--accent)" : "var(--muted)" }}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </label>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>
        Get notified when someone submits a landing page form. Configure any combination of Slack, Discord, or Email.
      </p>

      {msg && (
        <div style={{
          padding: "0.5rem 0.75rem", borderRadius: "0.4rem", marginBottom: "0.75rem",
          background: msg.type === "ok" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${msg.type === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.type === "ok" ? "#22c55e" : "#ef4444", fontSize: "0.8rem",
        }}>
          {msg.type === "ok" ? "✅ " : "❌ "}{msg.text}
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem", maxWidth: "500px" }}>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>
            <span>💬</span> Slack Webhook URL
          </label>
          <input
            type="url" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--border)", fontSize: "0.8rem", background: "var(--bg-secondary)", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>
            <span>🎮</span> Discord Webhook URL
          </label>
          <input
            type="url" value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--border)", fontSize: "0.8rem", background: "var(--bg-secondary)", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>
            <span>📧</span> Email Notification Recipient
          </label>
          <input
            type="email" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--border)", fontSize: "0.8rem", background: "var(--bg-secondary)", boxSizing: "border-box" }}
          />
          <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Requires at least one SMTP config enabled in SMTP Health
          </p>
        </div>

        <button
          onClick={handleSave} disabled={loading}
          style={{ padding: "0.6rem 1.5rem", borderRadius: "0.4rem", border: "none", background: "var(--accent)", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", opacity: loading ? 0.5 : 1, alignSelf: "flex-start" }}
        >
          {loading ? "⏳ Saving..." : "💾 Save Webhook Settings"}
        </button>
      </div>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirm) {
      setMsg({ type: "err", text: "New passwords don't match" });
      return;
    }
    if (newPass.length < 4) {
      setMsg({ type: "err", text: "Password must be at least 4 characters" });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: "ok", text: "Password updated successfully!" });
        setNewRecoveryCode(data.recoveryCode || "");
        setCurrent("");
        setNewPass("");
        setConfirm("");
      } else {
        setMsg({ type: "err", text: data.error || "Failed" });
      }
    } catch {
      setMsg({ type: "err", text: "Connection error" });
    }
    setLoading(false);
  };

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        🔐 Change Password
      </h3>

      {msg && (
        <div style={{
          padding: "0.6rem 0.8rem", borderRadius: "0.4rem", marginBottom: "0.75rem",
          background: msg.type === "ok" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${msg.type === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.type === "ok" ? "#22c55e" : "#ef4444", fontSize: "0.8rem",
        }}>
          {msg.type === "ok" ? "✅ " : "❌ "}{msg.text}
        </div>
      )}

      {newRecoveryCode && (
        <div style={{
          padding: "0.75rem", borderRadius: "0.4rem", marginBottom: "0.75rem",
          background: "rgba(15, 23, 42, 0.6)", border: "2px dashed rgba(34, 197, 94, 0.5)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🆕 Your New Recovery Code
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "monospace", color: "#22c55e", letterSpacing: "0.1em" }}>
            {newRecoveryCode}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#f59e0b", marginTop: "0.4rem" }}>
            ⚠️ Save this code somewhere safe! It&apos;s your only way to reset your password.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", maxWidth: "400px" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>Current Password</label>
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--border)", fontSize: "0.8rem", background: "var(--bg-secondary)" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>New Password</label>
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--border)", fontSize: "0.8rem", background: "var(--bg-secondary)" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>Confirm New Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid var(--border)", fontSize: "0.8rem", background: "var(--bg-secondary)" }} />
        </div>
        <button type="submit" disabled={loading || !current || !newPass || !confirm}
          style={{ padding: "0.6rem 1.5rem", borderRadius: "0.4rem", border: "none", background: "var(--accent)", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", opacity: loading || !current || !newPass || !confirm ? 0.5 : 1 }}>
          {loading ? "⏳ Updating..." : "💾 Update Password"}
        </button>
      </form>

      <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.75rem" }}>
        ⚠️ Changing your password will generate a new recovery code. Save it somewhere safe!
      </p>
    </div>
  );
}
