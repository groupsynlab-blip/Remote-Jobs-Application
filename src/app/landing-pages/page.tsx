"use client";

import { useEffect, useState } from "react";
import { getDb } from "@/lib/db";

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  title: string;
  description: string;
  form_fields: string;
  success_message: string;
  theme: string;
  target_list_id: string | null;
  list_name: string | null;
  enabled: number;
  view_count: number;
  submission_count: number;
  created_at: string;
}

interface ContactList { id: string; name: string; }

export default function LandingPagesPage() {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formFields, setFormFields] = useState("email,name");
  const [successMessage, setSuccessMessage] = useState("Thank you for submitting!");
  const [targetListId, setTargetListId] = useState("");
  const [previewPage, setPreviewPage] = useState<LandingPage | null>(null);

  useEffect(() => {
    fetchPages();
    fetch("/api/landing-pages").then(r => r.json()).then(setPages);
    fetch("/api/contacts").then(r => r.json()).then(d => setLists(d.lists || [])).catch(() => {});
  }, []);

  const fetchPages = () => {
    fetch("/api/landing-pages").then(r => r.json()).then(setPages);
  };

  const handleSave = async () => {
    const method = editingPage ? "PUT" : "POST";
    const res = await fetch("/api/landing-pages", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editingPage ? { id: editingPage.id } : {}),
        name, slug, title, description,
        form_fields: formFields.split(",").map(f => f.trim()),
        success_message: successMessage,
        target_list_id: targetListId || null,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      setEditingPage(null);
      resetForm();
      fetchPages();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this landing page?")) return;
    await fetch(`/api/landing-pages?id=${id}`, { method: "DELETE" });
    fetchPages();
  };

  const resetForm = () => {
    setName(""); setSlug(""); setTitle(""); setDescription("");
    setFormFields("email,name"); setSuccessMessage("Thank you for submitting!");
    setTargetListId("");
  };

  const copyEmbedCode = (page: LandingPage) => {
    const code = `<iframe src="${window.location.origin}/landing-pages/public/${page.slug}" width="100%" height="600" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code);
    alert("Embed code copied!");
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>📄 Landing Pages</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Create landing pages with forms that feed contacts into your lists
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingPage(null); resetForm(); }}
          style={{
            padding: "0.75rem 1.5rem", borderRadius: "0.75rem", border: "none",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
            fontWeight: 600, cursor: "pointer", fontSize: "0.875rem",
          }}
        >
          + New Landing Page
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Total Pages", value: pages.length, icon: "📄" },
          { label: "Total Views", value: pages.reduce((s, p) => s + p.view_count, 0), icon: "👁️" },
          { label: "Total Submissions", value: pages.reduce((s, p) => s + p.submission_count, 0), icon: "📝" },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem" }}>{stat.icon}</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem" }}>{stat.value}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>
            {editingPage ? "Edit Landing Page" : "Create Landing Page"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input"
                placeholder="My Landing Page" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>URL Slug</label>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="input"
                placeholder="my-page" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="input"
                placeholder="Welcome — Sign Up Now" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="input"
                rows={2} placeholder="A brief description of the landing page" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Form Fields (comma-separated)</label>
              <input value={formFields} onChange={e => setFormFields(e.target.value)} className="input"
                placeholder="email,name,company" />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Target Contact List</label>
              <select value={targetListId} onChange={e => setTargetListId(e.target.value)} className="input">
                <option value="">— None (don't auto-add) —</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Success Message</label>
              <input value={successMessage} onChange={e => setSuccessMessage(e.target.value)} className="input"
                placeholder="Thank you for submitting!" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button onClick={handleSave} style={{
              padding: "0.625rem 1.5rem", borderRadius: "0.5rem", border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
              fontWeight: 600, cursor: "pointer",
            }}>Save</button>
            <button onClick={() => { setShowForm(false); setEditingPage(null); }} style={{
              padding: "0.625rem 1.5rem", borderRadius: "0.5rem",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted)", cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Pages List */}
      <div style={{ display: "grid", gap: "1rem" }}>
        {pages.map(page => (
          <div key={page.id} className="card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{page.name}</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                  /{page.slug} • {page.list_name ? `→ ${page.list_name}` : "No target list"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{
                  padding: "0.2rem 0.5rem", borderRadius: "1rem", fontSize: "0.65rem", fontWeight: 600,
                  background: page.enabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: page.enabled ? "#22c55e" : "#ef4444",
                }}>
                  {page.enabled ? "Live" : "Disabled"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem" }}>
              <div style={{ fontSize: "0.8rem" }}>
                <span style={{ color: "var(--muted)" }}>Views:</span>{" "}
                <strong>{page.view_count}</strong>
              </div>
              <div style={{ fontSize: "0.8rem" }}>
                <span style={{ color: "var(--muted)" }}>Submissions:</span>{" "}
                <strong>{page.submission_count}</strong>
              </div>
              <div style={{ fontSize: "0.8rem" }}>
                <span style={{ color: "var(--muted)" }}>Fields:</span>{" "}
                <strong>{JSON.parse(page.form_fields || '[]').join(", ")}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button onClick={() => copyEmbedCode(page)} style={{
                padding: "0.375rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)",
                background: "transparent", fontSize: "0.7rem", cursor: "pointer",
              }}>📋 Copy Embed</button>
              <button onClick={() => setPreviewPage(page)} style={{
                padding: "0.375rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)",
                background: "transparent", fontSize: "0.7rem", cursor: "pointer",
              }}>👁️ Preview</button>
              <button onClick={() => handleDelete(page.id)} style={{
                padding: "0.375rem 0.75rem", borderRadius: "0.375rem", border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "0.7rem", cursor: "pointer",
              }}>🗑️ Delete</button>
            </div>
          </div>
        ))}
        {pages.length === 0 && (
          <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📄</p>
            <p>No landing pages yet. Create one to get started!</p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewPage && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => setPreviewPage(null)}>
          <div style={{
            background: "#fff", borderRadius: "1rem", width: "90%", maxWidth: "500px",
            padding: "2rem", position: "relative",
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewPage(null)} style={{
              position: "absolute", top: "1rem", right: "1rem", background: "none",
              border: "none", fontSize: "1.25rem", cursor: "pointer",
            }}>✕</button>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>{previewPage.title}</h2>
            <p style={{ color: "#666", fontSize: "0.875rem", marginBottom: "1.5rem" }}>{previewPage.description}</p>
            <div style={{ background: "#f1f5f9", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#666" }}>Public URL: </span>
              <a href={"/landing-pages/public/" + previewPage.slug} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "#6366f1", textDecoration: "underline", wordBreak: "break-all" }}>
                {`${typeof window !== "undefined" ? window.location.origin : ""}/landing-pages/public/${previewPage.slug}`}
              </a>
            </div>
            <form onSubmit={e => { e.preventDefault(); alert(previewPage.success_message); }} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {(() => {
                const fields = JSON.parse(previewPage.form_fields || '["email","name"]');
                return fields.map((field: any, i: number) => {
                  const name = typeof field === 'string' ? field : field.name || `field_${i}`;
                  const type = typeof field === 'string' ? (field === 'email' ? 'email' : 'text') : (field.type || 'text');
                  const required = typeof field === 'string' ? field === 'email' : !!field.required;
                  if (type === 'select' && field.options) {
                    return (
                      <div key={name}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', textTransform: 'capitalize' }}>
                          {name.replace(/_/g, ' ')}{required && ' *'}
                        </label>
                        <select required={required} style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #ddd', fontSize: '0.875rem', boxSizing: 'border-box' }}>
                          <option value="">Select...</option>
                          {field.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    );
                  }
                  if (type === 'textarea') {
                    return (
                      <div key={name}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', textTransform: 'capitalize' }}>
                          {name.replace(/_/g, ' ')}{required && ' *'}
                        </label>
                        <textarea placeholder={`Enter ${name.replace(/_/g, ' ')}`} required={required}
                          style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #ddd', fontSize: '0.875rem', boxSizing: 'border-box', minHeight: '80px' }} />
                      </div>
                    );
                  }
                  return (
                    <div key={name}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', textTransform: 'capitalize' }}>
                        {name.replace(/_/g, ' ')}{required && ' *'}
                      </label>
                      <input type={type === 'tel' ? 'tel' : type === 'url' ? 'url' : type === 'email' ? 'email' : 'text'}
                        placeholder={`Enter ${name.replace(/_/g, ' ')}`} required={required}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #ddd', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                    </div>
                  );
                });
              })()}
              <button type="submit" style={{
                padding: "0.75rem", borderRadius: "0.5rem", border: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
                fontWeight: 600, cursor: "pointer", fontSize: "0.875rem", marginTop: "0.5rem",
              }}>Submit</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
