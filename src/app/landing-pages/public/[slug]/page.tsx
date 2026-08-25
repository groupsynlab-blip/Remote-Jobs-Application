"use client";

import { useEffect, useState, use } from "react";

export default function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [page, setPage] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/landing-pages/public/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setPage(data);
        setLoading(false);
      })
      .catch(() => {
        setPage(null);
        setLoading(false);
      });
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/landing-pages/public/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setResult({ success: res.ok, message: data.message || data.error || "Submitted!" });
    } catch {
      setResult({ success: false, message: "Network error. Please try again." });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a, #1e293b, #334155)" }}>
        <div style={{ color: "#94a3b8", fontSize: "1.1rem" }}>Loading...</div>
      </div>
    );
  }

  if (!page) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a, #1e293b)" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>404</div>
          <div>This page does not exist or is no longer active.</div>
        </div>
      </div>
    );
  }

  // Parse fields - handle both string and object formats
  const rawFields = typeof page.form_fields === "string" ? JSON.parse(page.form_fields) : page.form_fields || ["email", "name"];
  
  const parsedFields = rawFields.map((field: any, i: number) => {
    if (typeof field === "string") {
      return { name: field, type: field === "email" ? "email" : "text", required: field === "email" || field === "name" };
    }
    return {
      name: field.name || `field_${i}`,
      type: field.type || "text",
      required: !!field.required,
      options: field.options || [],
    };
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a, #1e293b, #334155)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        maxWidth: "520px", width: "100%",
        background: "rgba(30, 41, 59, 0.8)", backdropFilter: "blur(20px)",
        border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "1rem",
        padding: "2.5rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "14px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 1rem", fontSize: "1.5rem",
            boxShadow: "0 0 20px rgba(99, 102, 241, 0.3)",
          }}>
            🚀
          </div>
          <h1 style={{ color: "#f1f5f9", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
            {page.title || page.name}
          </h1>
          {page.description && (
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              {page.description}
            </p>
          )}
        </div>

        {/* Success Message */}
        {result && (
          <div style={{
            padding: "1rem 1.25rem", borderRadius: "0.75rem", marginBottom: "1.5rem",
            background: result.success ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${result.success ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: result.success ? "#4ade80" : "#f87171",
            fontSize: "0.85rem", lineHeight: 1.5,
          }}>
            {result.success ? "✅ " : "❌ "}{result.message}
          </div>
        )}

        {/* Form */}
        {!result?.success && (
          <form onSubmit={handleSubmit}>
            {parsedFields.map((field: any) => {
              const label = field.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
              const inputType = field.type === "tel" ? "tel" : field.type === "url" ? "url" : field.type === "email" ? "email" : "text";
              
              if (field.type === "textarea") {
                return (
                  <div key={field.name} style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", color: "#cbd5e1", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {label} {field.required ? "*" : ""}
                    </label>
                    <textarea
                      required={field.required}
                      rows={4}
                      placeholder={`Your ${label}...`}
                      value={formData[field.name] || ""}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "0.5rem", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "0.85rem", background: "rgba(15, 23, 42, 0.6)", color: "#e2e8f0", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" as const }}
                    />
                  </div>
                );
              }
              
              if (field.type === "select" && field.options?.length) {
                return (
                  <div key={field.name} style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", color: "#cbd5e1", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {label} {field.required ? "*" : ""}
                    </label>
                    <select
                      required={field.required}
                      value={formData[field.name] || ""}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "0.5rem", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "0.85rem", background: "rgba(15, 23, 42, 0.6)", color: "#e2e8f0", outline: "none", boxSizing: "border-box" as const }}
                    >
                      <option value="">Select {label}...</option>
                      {field.options.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                );
              }

              return (
                <div key={field.name} style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", color: "#cbd5e1", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {label} {field.required ? "*" : ""}
                  </label>
                  <input
                    type={inputType}
                    required={field.required}
                    placeholder={`Your ${label}...`}
                    value={formData[field.name] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "0.5rem", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "0.85rem", background: "rgba(15, 23, 42, 0.6)", color: "#e2e8f0", outline: "none", boxSizing: "border-box" as const }}
                  />
                </div>
              );
            })}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%", padding: "0.8rem", borderRadius: "0.5rem", border: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
                color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
                marginTop: "0.5rem", letterSpacing: "0.02em",
                boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "⏳ Submitting..." : "🚀 Submit Application"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "1.5rem", color: "#475569", fontSize: "0.7rem" }}>
          Powered by Bulk Emailer
        </div>
      </div>
    </div>
  );
}
