"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  totalContacts: number;
  totalLists: number;
  totalTemplates: number;
  total_campaigns: number;
  sent_campaigns: number;
  active_campaigns: number;
  scheduled_campaigns: number;
  total_emails: number;
  total_sent: number;
  total_failed: number;
  total_opens: number;
  recentCampaigns: any[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  if (!stats) {
    return <div style={{ padding: "2rem", color: "var(--muted)" }}>Loading...</div>;
  }

  const openRate = stats.total_sent > 0
    ? ((stats.total_opens || 0) / stats.total_sent * 100).toFixed(1)
    : "0.0";

  const statCards = [
    { label: "Total Contacts", value: stats.totalContacts, icon: "👥", color: "var(--accent)" },
    { label: "Contact Lists", value: stats.totalLists, icon: "📋", color: "var(--success)" },
    { label: "Templates", value: stats.totalTemplates, icon: "📝", color: "var(--warning)" },
    { label: "Campaigns Sent", value: stats.sent_campaigns || 0, icon: "🚀", color: "var(--success)" },
    { label: "Emails Sent", value: stats.total_sent || 0, icon: "✉️", color: "var(--accent)" },
    { label: "Emails Opened", value: stats.total_opens || 0, icon: "👁️", color: "var(--success)" },
    { label: "Open Rate", value: `${openRate}%`, icon: "📊", color: "var(--accent)" },
    { label: "Failed", value: stats.total_failed || 0, icon: "⚠️", color: "var(--danger)" },
  ];

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Dashboard</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
          Overview of your email campaigns
        </p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {statCards.map((card) => (
          <div key={card.label} className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{
              fontSize: "1.5rem",
              width: "3rem",
              height: "3rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.5rem",
              background: `${card.color}15`,
            }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{typeof card.value === "number" ? card.value.toLocaleString() : card.value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <Link href="/compose" className="btn btn-primary" style={{ justifyContent: "center", padding: "1rem" }}>
          ✏️ Compose Campaign
        </Link>
        <Link href="/contacts" className="btn btn-secondary" style={{ justifyContent: "center", padding: "1rem" }}>
          👥 Manage Contacts
        </Link>
        <Link href="/templates" className="btn btn-secondary" style={{ justifyContent: "center", padding: "1rem" }}>
          📝 Create Template
        </Link>
      </div>

      {/* Recent Campaigns */}
      <div className="card">
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Campaigns</h2>
        {stats.recentCampaigns?.length === 0 ? (
          <p style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
            No campaigns yet. Create your first one!
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Opens</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCampaigns?.map((campaign: any) => (
                  <tr key={campaign.id}>
                    <td style={{ fontWeight: 500 }}>{campaign.name}</td>
                    <td>
                      <span className={`badge badge-${campaign.status}`}>{campaign.status}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div className="progress-bar" style={{ width: "100px" }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${campaign.total_count > 0 ? (campaign.sent_count / campaign.total_count) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                          {campaign.sent_count}/{campaign.total_count}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
                        {campaign.open_count || 0}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
