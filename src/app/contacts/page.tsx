"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface ColumnMapping {
  email: number | null;
  name: number | null;
  phone: number | null;
  company: number | null;
  title: number | null;
}

interface PreviewData {
  totalRows: number;
  headers: string[];
  columnMappings: { index: number; header: string; detectedType: string }[];
  previewRows: Record<string, string>[];
  emailCount: number;
  duplicateStats: {
    internalDuplicates: { email: string; count: number }[];
    dbDuplicates: string[];
    totalDuplicates: number;
  };
  invalidEmails: { row: number; email: string; reason: string }[];
  cleanListName: string;
}

interface ImportResult {
  listId: string;
  listName: string;
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

const STEPS = [
  { id: "upload", label: "Upload", icon: "📁" },
  { id: "preview", label: "Preview", icon: "👁️" },
  { id: "map", label: "Map Columns", icon: "🔗" },
  { id: "duplicates", label: "Duplicates", icon: "🔍" },
  { id: "import", label: "Import", icon: "📥" },
];

export default function ContactsPage() {
  const [wizardStep, setWizardStep] = useState(0);
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    email: null, name: null, phone: null, company: null, title: null,
  });
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update" | "add_anyway">("skip");
  const [listName, setListName] = useState("");
  const [existingListId, setExistingListId] = useState<string>("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [view, setView] = useState<"wizard" | "contacts" | "lists">("wizard");
  const [dataLoading, setDataLoading] = useState(true);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setDataLoading(true);
    const res = await fetch("/api/contacts");
    const data = await res.json();
    setContacts(data.contacts || []);
    setLists(data.lists || []);
    setDataLoading(false);
  };

  const processCsv = useCallback(async (text: string, fileName: string) => {
    setCsvText(text);
    setCsvFileName(fileName);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: text, listName }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      setPreviewData(data);
      const mapping: ColumnMapping = { email: null, name: null, phone: null, company: null, title: null };
      data.columnMappings.forEach((col: any) => {
        if (col.detectedType === "email" && mapping.email === null) mapping.email = col.index;
        else if (col.detectedType === "name" && mapping.name === null) mapping.name = col.index;
        else if (col.detectedType === "phone" && mapping.phone === null) mapping.phone = col.index;
        else if (col.detectedType === "company" && mapping.company === null) mapping.company = col.index;
        else if (col.detectedType === "title" && mapping.title === null) mapping.title = col.index;
      });
      if (mapping.email === null && data.previewRows.length > 0) {
        for (const col of data.columnMappings) {
          const sample = data.previewRows[0]?.[col.header] || "";
          if (sample.includes("@")) { mapping.email = col.index; break; }
        }
      }
      setColumnMapping(mapping);
      setListName(data.cleanListName);
      setWizardStep(1);
    } catch (err: any) { setError(err.message || "Failed to parse CSV"); }
    finally { setLoading(false); }
  }, [listName]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => processCsv(text, file.name));
    e.target.value = "";
  };

  const handlePasteImport = () => {
    if (!pasteText.trim()) { setError("Please paste some data first"); return; }
    processCsv(pasteText, "Pasted Data");
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) { file.text().then(text => processCsv(text, file.name)); }
  };

  const handleImport = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText, listName, columnMapping, duplicateAction,
          createNewList: !existingListId,
          existingListId: existingListId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      setImportResult(data);
      setWizardStep(4);
      loadData();
    } catch (err: any) { setError(err.message || "Import failed"); }
    finally { setLoading(false); }
  };

  const resetWizard = () => {
    setWizardStep(0); setCsvText(""); setCsvFileName("");
    setPreviewData(null);
    setColumnMapping({ email: null, name: null, phone: null, company: null, title: null });
    setDuplicateAction("skip"); setListName(""); setExistingListId("");
    setImportResult(null); setError(null); setPasteText("");
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
    const csv = "email,name,phone,company,title\njohn@example.com,John Doe,+1234567890,Acme Corp,Manager\njane@example.com,Jane Smith,+0987654321,Tech Inc,Director\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample_contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const stepStyle = (idx: number): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: "0.5rem",
    padding: "0.5rem 1rem", borderRadius: "0.5rem", fontSize: "0.8rem",
    fontWeight: idx === wizardStep ? 700 : 400,
    background: idx === wizardStep ? "var(--accent)" : idx < wizardStep ? "rgba(34,197,94,0.1)" : "var(--card)",
    color: idx === wizardStep ? "#fff" : idx < wizardStep ? "var(--success)" : "var(--muted)",
    border: `1px solid ${idx === wizardStep ? "var(--accent)" : "var(--border)"}`,
  });

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Contacts</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>Import, manage, and organize your contacts</p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button className={`btn ${view === "wizard" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("wizard")}>🪄 Import Wizard</button>
        <button className={`btn ${view === "contacts" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("contacts")}>👤 Contacts ({contacts.length})</button>
        <button className={`btn ${view === "lists" ? "btn-primary" : "btn-secondary"}`} onClick={() => setView("lists")}>📋 Lists ({lists.length})</button>
      </div>

      {view === "wizard" && (
        <div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {STEPS.map((step, idx) => (
              <div key={step.id} style={stepStyle(idx)}>
                <span>{step.icon}</span><span>{step.label}</span>
                {idx < wizardStep && <span>✓</span>}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem", marginBottom: "1rem", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontSize: "0.875rem" }}>
              ⚠️ {error}
              <button onClick={() => setError(null)} style={{ marginLeft: "1rem", color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
            </div>
          )}

          {wizardStep === 0 && (
            <div className="card">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>📁 Upload Your Contacts</h2>
              <div ref={dragRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                style={{ border: "2px dashed var(--border)", borderRadius: "0.75rem", padding: "2.5rem", textAlign: "center", marginBottom: "1.5rem", cursor: "pointer" }}
                onClick={() => fileInputRef.current?.click()}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📂</div>
                <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Drag & drop a CSV file here</p>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>or click to browse — supports .csv, .txt files</p>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>or paste data</span>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              </div>
              <textarea className="input" placeholder={"Paste your data here...\n\nExamples:\nemail,name\njohn@example.com,John Doe\n\nOr: Name <email> format\nJane Doe <jane@example.com>"}
                value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                style={{ minHeight: "150px", fontFamily: "monospace", fontSize: "0.8rem", marginBottom: "1rem" }} />
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={handlePasteImport} disabled={!pasteText.trim() || loading}>
                  {loading ? "⏳ Parsing..." : "👁️ Preview Data"}
                </button>
                <button className="btn btn-secondary" onClick={downloadSampleCsv} type="button">📄 Download Sample CSV</button>
              </div>
            </div>
          )}

          {wizardStep === 1 && previewData && (
            <div className="card">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>👁️ Preview: {csvFileName || "Pasted Data"}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <div style={{ padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{previewData.totalRows}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Total Rows</div>
                </div>
                <div style={{ padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{previewData.emailCount}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Emails Found</div>
                </div>
                <div style={{ padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--danger)" }}>{previewData.duplicateStats.totalDuplicates}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>DB Duplicates</div>
                </div>
                <div style={{ padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--warning)" }}>{previewData.invalidEmails.length}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Invalid Emails</div>
                </div>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>Auto-detected columns:</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {previewData.columnMappings.map((col) => (
                    <span key={col.index} style={{ padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.75rem",
                      background: col.detectedType !== "other" ? "rgba(34,197,94,0.1)" : "var(--background)",
                      color: col.detectedType !== "other" ? "var(--success)" : "var(--muted)", border: "1px solid var(--border)" }}>
                      {col.header}{col.detectedType !== "other" && <span style={{ marginLeft: "0.25rem" }}>→ {col.detectedType}</span>}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
                <table style={{ fontSize: "0.8rem", width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{previewData.headers.map((h, i) => (
                    <th key={i} style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "var(--background)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{previewData.previewRows.map((row, i) => (
                    <tr key={i}>{previewData.headers.map((h, j) => (
                      <td key={j} style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row[h]}</td>
                    ))}</tr>
                  ))}</tbody>
                </table>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>Showing first {Math.min(20, previewData.totalRows)} of {previewData.totalRows} rows</p>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn btn-secondary" onClick={() => setWizardStep(0)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setWizardStep(2)}>Map Columns →</button>
              </div>
            </div>
          )}

          {wizardStep === 2 && previewData && (
            <div className="card">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>🔗 Map Columns</h2>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "1rem" }}>Map CSV columns to contact fields. Email is required.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.375rem" }}>List Name</label>
                  <input className="input" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g., Newsletter Subscribers" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.375rem" }}>Add to List</label>
                  <select className="input" value={existingListId} onChange={(e) => setExistingListId(e.target.value)}>
                    <option value="">Create New List</option>
                    {lists.map((l) => (<option key={l.id} value={l.id}>{l.name} ({l.member_count} contacts)</option>))}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {(["email", "name", "phone", "company", "title"] as const).map((field) => {
                  const required = field === "email";
                  return (
                    <div key={field} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "0.75rem", alignItems: "center", padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem" }}>
                      <div><span style={{ fontWeight: 500, fontSize: "0.875rem", textTransform: "capitalize" }}>{field}{required && <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }}>*</span>}</span></div>
                      <select className="input" value={columnMapping[field] ?? ""}
                        onChange={(e) => setColumnMapping({ ...columnMapping, [field]: e.target.value === "" ? null : parseInt(e.target.value) })}>
                        <option value="">— Skip this field —</option>
                        {previewData.columnMappings.map((col) => (
                          <option key={col.index} value={col.index}>{col.header}{col.detectedType !== "other" ? ` (${col.detectedType})` : ""}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {previewData.previewRows.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>Sample mapping:</p>
                  <div style={{ padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", fontSize: "0.8rem", fontFamily: "monospace" }}>
                    {Object.entries(columnMapping).filter(([, v]) => v !== null).map(([field, colIdx]) => {
                      const header = previewData.headers[colIdx!];
                      const value = previewData.previewRows[0]?.[header] || "—";
                      return (<div key={field} style={{ padding: "0.125rem 0" }}>
                        <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{field}:</span>{" "}
                        <span style={{ color: "var(--accent)" }}>{value}</span>
                      </div>);
                    })}
                  </div>
                </div>
              )}
              {columnMapping.email === null && (
                <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.5rem", marginBottom: "1rem", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontSize: "0.8rem" }}>
                  ⚠️ You must map the Email column to continue
                </div>
              )}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn btn-secondary" onClick={() => setWizardStep(1)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setWizardStep(3)} disabled={columnMapping.email === null}>Check Duplicates →</button>
              </div>
            </div>
          )}

          {wizardStep === 3 && previewData && (
            <div className="card">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>🔍 Duplicate Detection</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <div style={{ padding: "1rem", background: "var(--background)", borderRadius: "0.5rem" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{previewData.emailCount}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Total emails</div>
                </div>
                <div style={{ padding: "1rem", background: "rgba(239,68,68,0.05)", borderRadius: "0.5rem", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--danger)" }}>{previewData.duplicateStats.totalDuplicates}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Already in your contacts</div>
                </div>
                <div style={{ padding: "1rem", background: "rgba(34,197,94,0.05)", borderRadius: "0.5rem", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--success)" }}>{previewData.emailCount - previewData.duplicateStats.totalDuplicates}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>New contacts</div>
                </div>
              </div>
              {previewData.duplicateStats.totalDuplicates > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>Duplicate emails found in your database:</p>
                  <div style={{ maxHeight: "200px", overflowY: "auto", padding: "0.75rem", background: "var(--background)", borderRadius: "0.5rem", fontSize: "0.8rem", fontFamily: "monospace" }}>
                    {previewData.duplicateStats.dbDuplicates.slice(0, 50).map((email, i) => (
                      <div key={i} style={{ padding: "0.125rem 0", color: "var(--danger)" }}>{email}</div>
                    ))}
                    {previewData.duplicateStats.dbDuplicates.length > 50 && (
                      <div style={{ color: "var(--muted)", padding: "0.25rem 0" }}>...and {previewData.duplicateStats.dbDuplicates.length - 50} more</div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.75rem" }}>What should we do with duplicates?</p>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {[
                    { value: "skip", label: "⏭️ Skip duplicates", desc: "Only import new contacts, keep existing ones unchanged" },
                    { value: "update", label: "🔄 Update existing", desc: "Update name/phone/company/title for existing contacts with new data" },
                    { value: "add_anyway", label: "➕ Add anyway", desc: "Import all contacts (may create duplicate entries)" },
                  ].map((opt) => (
                    <label key={opt.value} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.75rem", borderRadius: "0.5rem", cursor: "pointer",
                      background: duplicateAction === opt.value ? "rgba(59,130,246,0.1)" : "var(--background)",
                      border: `1px solid ${duplicateAction === opt.value ? "var(--accent)" : "var(--border)"}` }}>
                      <input type="radio" name="duplicateAction" value={opt.value} checked={duplicateAction === opt.value}
                        onChange={(e) => setDuplicateAction(e.target.value as any)} style={{ marginTop: "0.125rem" }} />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{opt.label}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {previewData.invalidEmails.length > 0 && (
                <div style={{ padding: "0.75rem", borderRadius: "0.5rem", marginBottom: "1.5rem", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", fontSize: "0.8rem" }}>
                  ⚠️ {previewData.invalidEmails.length} invalid email(s) will be skipped
                </div>
              )}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn btn-secondary" onClick={() => setWizardStep(2)}>← Back</button>
                <button className="btn btn-primary" onClick={() => { setWizardStep(4); handleImport(); }} disabled={loading}>
                  {loading ? "⏳ Importing..." : `📥 Import ${previewData.emailCount - (duplicateAction === "skip" ? previewData.duplicateStats.totalDuplicates : 0)} Contacts`}
                </button>
              </div>
            </div>
          )}

          {wizardStep === 4 && importResult && (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Import Complete!</h2>
              <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
                Your contacts have been imported into list <strong>&quot;{importResult.listName}&quot;</strong>
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "1rem", maxWidth: "500px", margin: "0 auto 2rem" }}>
                <div style={{ padding: "1rem", background: "rgba(34,197,94,0.1)", borderRadius: "0.5rem" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--success)" }}>{importResult.imported}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Imported</div>
                </div>
                {importResult.updated > 0 && (
                  <div style={{ padding: "1rem", background: "rgba(59,130,246,0.1)", borderRadius: "0.5rem" }}>
                    <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>{importResult.updated}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Updated</div>
                  </div>
                )}
                {importResult.skipped > 0 && (
                  <div style={{ padding: "1rem", background: "rgba(251,191,36,0.1)", borderRadius: "0.5rem" }}>
                    <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--warning)" }}>{importResult.skipped}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Skipped</div>
                  </div>
                )}
                <div style={{ padding: "1rem", background: "var(--background)", borderRadius: "0.5rem" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 700 }}>{importResult.total}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Total Processed</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={resetWizard}>🔄 Import More</button>
                <button className="btn btn-secondary" onClick={() => setView("contacts")}>👤 View Contacts</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "contacts" && (
        <div className="card">
          {dataLoading ? (
            <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
          ) : contacts.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</p>
              <p style={{ color: "var(--muted)" }}>No contacts yet. Use the Import Wizard to get started!</p>
              <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => setView("wizard")}>🪄 Open Import Wizard</button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>Email</th><th>Name</th><th>Phone</th><th>Company</th><th>Added</th><th>Actions</th></tr></thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.email}</td>
                      <td style={{ color: "var(--muted)" }}>{c.name || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{c.phone || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{c.company || "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      <td><button className="btn btn-danger" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => deleteContact(c.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "lists" && (
        <div className="card">
          {dataLoading ? (
            <p style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>Loading...</p>
          ) : lists.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</p>
              <p style={{ color: "var(--muted)" }}>No lists yet. Import contacts to create a list!</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>List Name</th><th>Contacts</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {lists.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.name}</td>
                      <td>{l.member_count}</td>
                      <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{new Date(l.created_at).toLocaleDateString()}</td>
                      <td><button className="btn btn-danger" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => deleteList(l.id)}>Delete</button></td>
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
