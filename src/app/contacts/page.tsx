"use client";

import { useEffect, useState, useRef } from "react";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [listName, setListName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"contacts" | "lists">("contacts");

  // Copy & Paste state
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<{ email: string; name: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await fetch("/api/contacts");
    const data = await res.json();
    setContacts(data.contacts || []);
    setLists(data.lists || []);
    setLoading(false);
  };

  // ─── Parse email from various formats ───
  const parseEmails = (text: string): { email: string; name: string }[] => {
    const results: { email: string; name: string }[] = [];
    const seen = new Set<string>();

    // Split by newlines, commas, or semicolons
    const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      let email = "";
      let name = "";

      // Format: "Name <email@example.com>"
      const angleMatch = line.match(/^(.+?)\s*<([^>]+)>$/);
      if (angleMatch) {
        name = angleMatch[1].trim().replace(/['"]/g, "");
        email = angleMatch[2].trim().toLowerCase();
      }
      // Format: "Name, email@example.com"
      else if (line.includes(",")) {
        const parts = line.split(",").map((p) => p.trim().replace(/['"]/g, ""));
        if (parts[0] && parts[0].includes("@")) {
          email = parts[0].toLowerCase();
          name = parts[1] || "";
        } else {
          name = parts[0];
          email = (parts[1] || "").toLowerCase();
        }
      }
      // Format: "email@example.com" or "email@example.com Name"
      else if (line.includes("@")) {
        const spaceParts = line.split(/\s+/);
        if (spaceParts[0].includes("@")) {
          email = spaceParts[0].toLowerCase();
          name = spaceParts.slice(1).join(" ").replace(/['"]/g, "");
        } else {
          email = spaceParts[spaceParts.length - 1].toLowerCase();
          name = spaceParts.slice(0, -1).join(" ").replace(/['"]/g, "");
        }
      }

      // Validate email
      if (email && email.includes("@") && email.includes(".") && !seen.has(email)) {
        seen.add(email);
        results.push({ email, name: name.replace(/['"]/g, "").trim() });
      }
    }

    return results;
  };

  // ─── Paste preview ───
  useEffect(() => {
    if (pasteText.trim()) {
      const parsed = parseEmails(pasteText);
      setPastePreview(parsed);
    } else {
      setPastePreview([]);
    }
  }, [pasteText]);

  // ─── Import from paste ───
  const handlePasteImport = async () => {
    if (pastePreview.length === 0) {
      setUploadResult("Error: No valid emails found in the pasted text");
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_csv",
          contacts: pastePreview,
          list_name: listName || `Paste Import ${new Date().toLocaleDateString()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUploadResult(`✅ Imported ${data.imported} contacts into list "${data.listName}"`);
        setPasteText("");
        setListName("");
        loadData();
      } else {
        setUploadResult(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setUploadResult(`Error: ${error.message}`);
    }
    setUploading(false);
  };

  // ─── CSV Upload ───
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length === 0) {
        setUploadResult("Error: Empty CSV file");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const emailIdx = headers.findIndex((h) => h === "email");
      const nameIdx = headers.findIndex((h) => h === "name" || h === "full_name" || h === "first_name");

      if (emailIdx === -1) {
        setUploadResult("Error: CSV must have an 'email' column");
        return;
      }

      const parsed = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
        return {
          email: cols[emailIdx],
          name: nameIdx >= 0 ? cols[nameIdx] : "",
        };
      });

      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_csv",
          contacts: parsed,
          list_name: listName || `CSV Upload ${new Date().toLocaleDateString()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUploadResult(`✅ Imported ${data.imported} contacts into list "${data.listName}"`);
        setListName("");
        loadData();
      } else {
        setUploadResult(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setUploadResult(`Error: ${error.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Text File Upload ───
  const handleTxtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const parsed = parseEmails(text);

      if (parsed.length === 0) {
        setUploadResult("Error: No valid emails found in the file");
        return;
      }

      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_csv",
          contacts: parsed,
          list_name: listName || `Text Upload ${new Date().toLocaleDateString()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUploadResult(`✅ Imported ${data.imported} contacts into list "${data.listName}"`);
        setListName("");
        loadData();
      } else {
        setUploadResult(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setUploadResult(`Error: ${error.message}`);
    } finally {
      setUploading(false);
      if (txtInputRef.current) txtInputRef.current.value = "";
    }
  };

  const deleteContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/contacts?id=${id}&type=contact`, { method: "DELETE" });
    loadData();
  };

  const deleteList = async (id: string) => {
    if (!confirm("Delete this list? Contacts will not be deleted.")) return;
    await fetch(`/api/contacts?id=${id}&type=list`, { method: "DELETE" });
    loadData();
  };

  const downloadSampleCsv = () => {
    const csv = "email,name\njohn@example.com,John Doe\njane@example.com,Jane Smith\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Contacts</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
          Manage your contacts and lists
        </p>
      </div>

      {/* List Name */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
          List Name (for all imports below)
        </label>
        <input
          className="input"
          placeholder="e.g., Newsletter Subscribers"
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          style={{ maxWidth: "400px" }}
        />
      </div>

      {/* ═══ Tab 1: Copy & Paste ═══ */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          📋 Copy & Paste
        </h2>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Paste emails directly. Supports: one per line, comma-separated, or &quot;Name &lt;email&gt;&quot; format.
        </p>
        <textarea
          className="input"
          placeholder={`john@example.com\nJane Doe <jane@example.com>\nBob Smith, bob@company.com`}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "0.8rem" }}
        />
        {pastePreview.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.375rem" }}>
              Preview ({pastePreview.length} contacts):
            </p>
            <div style={{
              maxHeight: "120px",
              overflowY: "auto",
              padding: "0.5rem",
              background: "var(--background)",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              fontFamily: "monospace",
            }}>
              {pastePreview.map((p, i) => (
                <div key={i} style={{ padding: "0.125rem 0", color: "var(--foreground)" }}>
                  {p.name && <span style={{ color: "var(--muted)" }}>{p.name} — </span>}
                  <span style={{ color: "var(--accent)" }}>{p.email}</span>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary"
              onClick={handlePasteImport}
              disabled={uploading}
              style={{ marginTop: "0.75rem" }}
            >
              {uploading ? "Importing..." : `📥 Import ${pastePreview.length} Contacts`}
            </button>
          </div>
        )}
      </div>

      {/* ═══ Tab 2: CSV File ═══ */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          📄 CSV File Upload
        </h2>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Upload a CSV file. Must have an <code>email</code> column. Optional: <code>name</code> column.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            disabled={uploading}
            style={{ fontSize: "0.875rem" }}
          />
          <button
            className="btn btn-secondary"
            onClick={downloadSampleCsv}
            type="button"
          >
            📄 Download Sample CSV
          </button>
        </div>
      </div>

      {/* ═══ Tab 3: Text File ═══ */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          📝 Text File Upload
        </h2>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Upload a <code>.txt</code> file with one email per line, or <code>name, email</code> format.
        </p>
        <input
          ref={txtInputRef}
          type="file"
          accept=".txt"
          onChange={handleTxtUpload}
          disabled={uploading}
          style={{ fontSize: "0.875rem" }}
        />
      </div>

      {/* Result */}
      {uploadResult && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
            background: uploadResult.startsWith("Error") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
            color: uploadResult.startsWith("Error") ? "var(--danger)" : "var(--success)",
          }}
        >
          {uploadResult}
        </div>
      )}

      {uploading && (
        <p style={{ color: "var(--accent)", marginBottom: "1rem" }}>Uploading...</p>
      )}

      {/* Tab toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          className={`btn ${view === "contacts" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setView("contacts")}
        >
          👤 Contacts ({contacts.length})
        </button>
        <button
          className={`btn ${view === "lists" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setView("lists")}
        >
          📋 Lists ({lists.length})
        </button>
      </div>

      {/* Contacts table */}
      {view === "contacts" && (
        <div className="card">
          {loading ? (
            <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
          ) : contacts.length === 0 ? (
            <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>
              No contacts yet. Import using any method above.
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.email}</td>
                      <td style={{ color: "var(--muted)" }}>{c.name || "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                          onClick={() => deleteContact(c.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Lists table */}
      {view === "lists" && (
        <div className="card">
          {loading ? (
            <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
          ) : lists.length === 0 ? (
            <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>
              No lists yet. Import contacts from any method above to create a list.
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>List Name</th>
                    <th>Contacts</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.name}</td>
                      <td>{l.member_count}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {new Date(l.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                          onClick={() => deleteList(l.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
