"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", body: "" });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const res = await fetch("/api/templates");
    setTemplates(await res.json());
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.body) {
      alert("All fields are required");
      return;
    }

    if (editing) {
      await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, ...form }),
      });
    } else {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setForm({ name: "", subject: "", body: "" });
    setEditing(null);
    setShowForm(false);
    loadTemplates();
  };

  const handleEdit = (template: Template) => {
    setForm({ name: template.name, subject: template.subject, body: template.body });
    setEditing(template);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    loadTemplates();
  };

  const insertVariable = (variable: string) => {
    setForm({ ...form, body: form.body + `{{${variable}}}` });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Templates</h1>
          <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
            Create and manage email templates
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setForm({ name: "", subject: "", body: "" });
            setEditing(null);
            setShowForm(!showForm);
          }}
        >
          {showForm ? "✕ Cancel" : "✏️ New Template"}
        </button>
      </div>

      {/* Template Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            {editing ? "Edit Template" : "New Template"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Template Name
              </label>
              <input
                className="input"
                placeholder="e.g., Welcome Email"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Subject Line
              </label>
              <input
                className="input"
                placeholder="e.g., Welcome to our platform, {{name}}!"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Body (HTML supported)
              </label>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={() => insertVariable("name")}>
                  + {"{{name}}"}
                </button>
                <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={() => insertVariable("email")}>
                  + {"{{email}}"}
                </button>
              </div>
              <textarea
                className="input"
                rows={10}
                placeholder={"<h1>Hello {{name}}!</h1>\n<p>Welcome to our newsletter...</p>"}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-primary" onClick={handleSave}>
                {editing ? "Update Template" : "Save Template"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setForm({ name: "", subject: "", body: "" });
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <p style={{ color: "var(--muted)", padding: "2rem" }}>Loading...</p>
      ) : templates.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--muted)" }}>No templates yet. Create your first one!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "1rem" }}>
          {templates.map((t) => (
            <div key={t.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{t.name}</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    Subject: {t.subject}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => handleEdit(t)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => handleDelete(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div
                style={{
                  padding: "0.75rem",
                  background: "var(--background)",
                  borderRadius: "0.5rem",
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                  color: "var(--muted)",
                  maxHeight: "100px",
                  overflow: "hidden",
                }}
              >
                {t.body}
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                Created: {new Date(t.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
