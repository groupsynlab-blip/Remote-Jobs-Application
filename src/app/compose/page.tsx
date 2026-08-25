"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── Template Preview Component ───────────────────────────────
function TemplatePreview({ template }: { template: any }) {
  const [showHtml, setShowHtml] = useState(false);
  const [sampleName, setSampleName] = useState("John Doe");
  const [sampleEmail, setSampleEmail] = useState("john@example.com");

  const renderPreview = (text: string) => {
    if (!text) return "";
    return text
      .replace(/\{\{\s*name\s*\}\}/gi, sampleName)
      .replace(/\{\{\s*email\s*\}\}/gi, sampleEmail);
  };

  const previewSubject = renderPreview(template.subject || "");
  const previewBody = renderPreview(template.body || "");

  // Extract variable names from template
  const vars = [...new Set((template.body + template.subject).match(/\{\{\s*\w+\s*\}\}/g) || [])] as string[];

  return (
    <div style={{ marginTop: "0.5rem", borderRadius: "0.5rem", border: "1px solid var(--border)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.5rem 0.75rem", background: "var(--background)",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>👁️ Template Preview</span>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button type="button" onClick={() => setShowHtml(false)} style={{
            padding: "0.175rem 0.5rem", borderRadius: "0.375rem", border: "none",
            fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
            background: !showHtml ? "var(--accent)" : "transparent",
            color: !showHtml ? "#fff" : "var(--muted)",
          }}>Text</button>
          <button type="button" onClick={() => setShowHtml(true)} style={{
            padding: "0.175rem 0.5rem", borderRadius: "0.375rem", border: "none",
            fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
            background: showHtml ? "var(--accent)" : "transparent",
            color: showHtml ? "#fff" : "var(--muted)",
          }}>HTML</button>
        </div>
      </div>

      {/* Sample inputs */}
      {vars.length > 0 && (
        <div style={{
          display: "flex", gap: "0.5rem", padding: "0.5rem 0.75rem",
          background: "rgba(99, 102, 241, 0.04)", borderBottom: "1px solid var(--border)",
          fontSize: "0.7rem",
        }}>
          <span style={{ color: "var(--muted)", alignSelf: "center" }}>Sample:</span>
          {vars.map((v) => {
            const name = v.replace(/[{}\s]/g, "").toLowerCase();
            return (
              <input key={v} type="text" style={{
                padding: "0.2rem 0.5rem", borderRadius: "0.25rem",
                border: "1px solid var(--border)", fontSize: "0.7rem",
                width: name === "email" ? "140px" : "100px",
                background: "#fff",
              }}
              value={name === "email" ? sampleEmail : sampleName}
              onChange={(e) => name === "email" ? setSampleEmail(e.target.value) : setSampleName(e.target.value)}
              placeholder={v}
              />
            );
          })}
        </div>
      )}

      {/* Subject preview */}
      <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)", fontSize: "0.75rem" }}>
        <span style={{ color: "var(--muted)", fontWeight: 500 }}>Subject: </span>
        <span style={{ fontWeight: 600 }}>{previewSubject}</span>
      </div>

      {/* Body preview */}
      <div style={{ padding: "0.75rem", maxHeight: "200px", overflowY: "auto", fontSize: "0.8rem" }}>
        {showHtml ? (
          <div dangerouslySetInnerHTML={{ __html: previewBody }} style={{
            fontFamily: "var(--font-geist-sans, sans-serif)", lineHeight: 1.5,
          }} />
        ) : (
          <pre style={{
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "var(--font-geist-mono, monospace)", fontSize: "0.75rem",
            margin: 0, color: "var(--foreground)",
          }}>{previewBody}</pre>
        )}
      </div>
    </div>
  );
}


export default function ComposePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[]>([""]);
  const [useSubjectRotation, setUseSubjectRotation] = useState(false);
  const [useTemplateRotation, setUseTemplateRotation] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    template_id: "",
    contact_list_id: "",
    delay_seconds: 2,
    scheduled_at: "",
    reply_to: "",
    enable_tracking: true,
    enable_unsubscribe: true,
  });

  // ─── Real-time sending state (all refs to avoid stale closures) ──
  const [isPaused, setIsPaused] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);
  const [sendLoopActive, setSendLoopActive] = useState(false);
  const [totalEmails, setTotalEmails] = useState(0);
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);

  // Use refs for counts so SSE callback always sees latest values
  const sentRef = useRef(0);
  const failedRef = useRef(0);
  const skippedRef = useRef(0);
  // Baseline counts from emails already sent before a pause/resume cycle
  const baselineSentRef = useRef(0);
  const baselineFailedRef = useRef(0);
  const [displaySent, setDisplaySent] = useState(0);
  const [displayFailed, setDisplayFailed] = useState(0);
  const [displaySkipped, setDisplaySkipped] = useState(0);
  const [displayRemaining, setDisplayRemaining] = useState(0);
  const [lastEmail, setLastEmail] = useState<string>("");
  const [lastStatus, setLastStatus] = useState<string>("");
  const [lastError, setLastError] = useState<string>("");
  const [isComplete, setIsComplete] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<any>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const autoPausedRef = useRef(false);
  const currentCampaignIdRef = useRef<string | null>(null);

  // ─── Speed metrics ─────────────────────────────────────────
  const sendStartTimeRef = useRef<number>(0);
  const lastProgressTimeRef = useRef<number>(0);
  const lastProgressCountRef = useRef(0);
  const [emailsPerMin, setEmailsPerMin] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // ─── Live email log ──────────────────────────────────────────
  type LogEntry = { id: number; time: string; email: string; status: string; error?: string };
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | "sent" | "failed" | "skipped">("all");
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const logIdRef = useRef(0);

  // ─── Connectivity Monitoring ──────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-resume if was auto-paused due to internet loss
      if (autoPausedRef.current) {
        autoPausedRef.current = false;
        setAutoPaused(false);
        console.log("[Compose] Internet restored — auto-resuming");
        resumeSending();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (sendLoopActive) {
        console.log("[Compose] Internet lost — auto-pausing");
        autoPausedRef.current = true;
        setAutoPaused(true);
        pauseSending();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sendLoopActive]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (autoScrollRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logEntries]);

  // ─── Fetch data ───────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/templates").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/scheduler").then((r) => r.json()),
    ]).then(([t, c, s]) => {
      setTemplates(t);
      setLists(c.lists || []);
      setSchedulerStatus(s);
      setIsPaused(s.paused || false);
      setIsOnline(s.online !== false);

      // Detect campaigns in "sending" status
      fetch("/api/campaigns").then((r) => r.json()).then((campaigns: any[]) => {
        const active = campaigns.find((c: any) => c.status === "sending" || c.status === "paused");
        if (active) {
          setActiveCampaign(active);
        }
      }).catch(() => {});
    });
  }, []);

  const addSubject = () => setSubjects([...subjects, ""]);
  const removeSubject = (index: number) => {
    if (subjects.length <= 1) return;
    setSubjects(subjects.filter((_, i) => i !== index));
  };
  const updateSubject = (index: number, value: string) => {
    const updated = [...subjects];
    updated[index] = value;
    setSubjects(updated);
  };

  // ─── Pause / Resume ───────────────────────────────────────────
  const pauseSending = async () => {
    try {
      await fetch("/api/scheduler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause" }) });
      setIsPaused(true);
    } catch (err: any) {
      console.error("Failed to pause:", err);
    }
  };

  const resumeSending = async () => {
    try {
      await fetch("/api/scheduler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }) });
      setIsPaused(false);
      setAutoPaused(false);
      autoPausedRef.current = false;

      // Re-open the SSE stream to continue processing remaining queued emails
      const campaignId = currentCampaignIdRef.current;
      if (campaignId) {
        // Keep baseline counts — the new stream will report fresh progress
        // and the start event will include previously_sent/previously_failed
        startStreaming(campaignId, totalEmails, true);
      }
    } catch (err: any) {
      console.error("Failed to resume:", err);
    }
  };

  // ─── Reconnect to an active campaign from a previous session ──
  const reconnectToCampaign = (campaign: any) => {
    setCurrentCampaignId(campaign.id);
    currentCampaignIdRef.current = campaign.id;
    setTotalEmails(campaign.total_count);
    baselineSentRef.current = campaign.sent_count || 0;
    baselineFailedRef.current = campaign.failed_count || 0;
    setDisplaySent(campaign.sent_count || 0);
    setDisplayFailed(campaign.failed_count || 0);
    setDisplayRemaining(campaign.total_count - (campaign.sent_count || 0) - (campaign.failed_count || 0));
    setActiveCampaign(null);
    startStreaming(campaign.id, campaign.total_count, true);
  };

  // ─── SSE Streaming Send ───────────────────────────────────────
  const startStreaming = (campaignId: string, total: number, isResume = false) => {
    // Store campaign ID for resume
    setCurrentCampaignId(campaignId);
    currentCampaignIdRef.current = campaignId;

    if (!isResume) {
      // Fresh start — reset everything
      sentRef.current = 0;
      failedRef.current = 0;
      skippedRef.current = 0;
      baselineSentRef.current = 0;
      baselineFailedRef.current = 0;
      setDisplaySent(0);
      setDisplayFailed(0);
      setDisplaySkipped(0);
      setLastEmail("");
      setLastStatus("");
      setLastError("");
    }
    // On resume, keep baseline refs as-is (they were set by the previous run)

    setIsComplete(false);
    setTotalEmails(total);
    setSendLoopActive(true);
    setIsPaused(false);

    // Reset per-stream counters (these are new emails in this stream)
    sentRef.current = 0;
    failedRef.current = 0;
    skippedRef.current = 0;
    setLogEntries([]);
    logIdRef.current = 0;

    // Reset speed metrics
    sendStartTimeRef.current = Date.now();
    lastProgressTimeRef.current = Date.now();
    lastProgressCountRef.current = 0;
    setEmailsPerMin(0);
    setEtaSeconds(0);
    setElapsedTime(0);

    setSendProgress(isResume ? `Resuming — processing remaining emails...` : `Starting to send ${total} emails...`);

    // Close any existing SSE
    eventSourceRef.current?.close();

    // Open SSE connection
    const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "start": {
            // Server reports previously_sent/previously_failed for resume scenarios
            const prevSent = data.previously_sent || 0;
            const prevFailed = data.previously_failed || 0;
            baselineSentRef.current = prevSent;
            baselineFailedRef.current = prevFailed;
            const totalAll = data.total || total;
            setTotalEmails(totalAll);
            // Show total across all runs
            setDisplaySent(prevSent);
            setDisplayFailed(prevFailed);
            setDisplayRemaining(data.remaining || (totalAll - prevSent - prevFailed));
            const msg = isResume
              ? `📤 Resumed — ${prevSent} already sent, ${data.remaining || 0} remaining`
              : `📤 Sending ${totalAll} emails — live progress below`;
            setSendProgress(msg);
            break;
          }

          case "progress": {
            // Update refs immediately (these are counts for THIS stream only)
            sentRef.current = data.sent;
            failedRef.current = data.failed;
            skippedRef.current = data.skipped;

            // Display = baseline (from prior runs) + this stream's counts
            const totalSent = baselineSentRef.current + data.sent;
            const totalFailed = baselineFailedRef.current + data.failed;
            setDisplaySent(totalSent);
            setDisplayFailed(totalFailed);
            setDisplaySkipped(data.skipped);
            setDisplayRemaining(data.remaining);
            setLastEmail(data.email);
            setLastStatus(data.status);
            setLastError(data.error || "");

            // Append to live log
            logIdRef.current += 1;
            const entry: LogEntry = {
              id: logIdRef.current,
              time: new Date().toLocaleTimeString(),
              email: data.email,
              status: data.status,
              error: data.error,
            };
            setLogEntries((prev) => {
              const next = [...prev, entry];
              // Keep max 1000 entries to avoid memory bloat
              return next.length > 1000 ? next.slice(-1000) : next;
            });

            // Calculate speed metrics
            const now = Date.now();
            const processed = data.sent + data.failed + data.skipped;
            const elapsed = (now - sendStartTimeRef.current) / 1000; // seconds
            setElapsedTime(Math.round(elapsed));

            // Calculate emails/min using a sliding window (last 10 seconds or all time)
            const timeSinceLast = (now - lastProgressTimeRef.current) / 1000;
            if (timeSinceLast >= 2) {
              // Update speed every 2+ seconds for stability
              const countDelta = processed - lastProgressCountRef.current;
              const speed = timeSinceLast > 0 ? (countDelta / timeSinceLast) * 60 : 0;
              setEmailsPerMin(Math.round(speed));
              lastProgressTimeRef.current = now;
              lastProgressCountRef.current = processed;

              // ETA
              const remaining = data.remaining || 0;
              if (speed > 0 && remaining > 0) {
                setEtaSeconds(Math.round((remaining / speed) * 60));
              } else {
                setEtaSeconds(0);
              }
            } else if (emailsPerMin === 0 && elapsed > 5) {
              // Initial speed estimate after 5 seconds
              const speed = processed / (elapsed / 60);
              setEmailsPerMin(Math.round(speed));
              const remaining = data.remaining || 0;
              if (speed > 0 && remaining > 0) {
                setEtaSeconds(Math.round((remaining / speed) * 60));
              }
            }

            // Progress message
            const grandTotal = totalSent + totalFailed + data.skipped + data.remaining;
            const pct = grandTotal > 0 ? Math.round(((totalSent + totalFailed + data.skipped) / grandTotal) * 100) : 0;
            setSendProgress(
              `📤 ${totalSent + totalFailed + data.skipped} / ${grandTotal} processed (${pct}%)` +
              (data.status === "sent" ? ` — ✉️ Sent to ${data.email}` : "") +
              (data.status === "failed" ? ` — ❌ Failed: ${data.email}` : "") +
              (data.status === "skipped" ? ` — ⏭ Skipped: ${data.email}` : "")
            );
            break;
          }

          case "paused": {
            setIsPaused(true);
            const pausedSent = baselineSentRef.current + data.sent;
            const pausedFailed = baselineFailedRef.current + data.failed;
            setDisplaySent(pausedSent);
            setDisplayFailed(pausedFailed);
            setDisplayRemaining(data.remaining);
            setSendProgress(
              `⏸ Paused — ${pausedSent} sent, ${pausedFailed} failed, ${data.remaining} remaining`
            );
            break;
          }

          case "done": {
            setIsComplete(true);
            const doneSent = baselineSentRef.current + data.sent;
            const doneFailed = baselineFailedRef.current + data.failed;
            setDisplaySent(doneSent);
            setDisplayFailed(doneFailed);
            setDisplayRemaining(data.remaining || 0);
            // Final speed snapshot
            const totalProcessed = doneSent + doneFailed + (data.skipped || 0);
            const totalElapsed = (Date.now() - sendStartTimeRef.current) / 1000;
            setElapsedTime(Math.round(totalElapsed));
            if (totalElapsed > 0) setEmailsPerMin(Math.round((totalProcessed / totalElapsed) * 60));
            setEtaSeconds(0);
            if (data.failed > 0) {
              setSendProgress(
                `✅ Done! ${doneSent} sent, ${doneFailed} failed, ${data.skipped} skipped`
              );
            } else {
              setSendProgress(`✅ All ${doneSent} emails sent successfully!`);
            }
            break;
          }

          case "error":
            setSendProgress(`❌ Error: ${data.message}`);
            break;
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    es.onerror = () => {
      // SSE connection lost — could be server restart or network issue
      if (!isComplete) {
        setSendProgress("⚠️ Connection lost. Checking status...");
        // Try to reconnect (EventSource auto-reconnects, but let's also check manually)
        setTimeout(async () => {
          try {
            const res = await fetch(`/api/campaigns/${campaignId}/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ batchSize: 1 }),
            });
            const data = await res.json();
            if (data.paused) {
              setIsPaused(true);
              setSendProgress("⏸ Sending paused. Click Resume to continue.");
            } else if (data.done) {
              setIsComplete(true);
              setSendProgress("✅ All emails sent successfully!");
            } else {
              // Reconnect SSE
              setSendProgress("🔄 Reconnecting...");
              startStreaming(campaignId, total);
            }
          } catch {
            setSendProgress("❌ Connection lost. Please check your network.");
          }
        }, 3000);
      }
    };
  };

  // ─── Handle Send ──────────────────────────────────────────────
  const handleSend = async (action: "send" | "schedule") => {
    if (!form.name || !form.template_id || !form.contact_list_id) {
      alert("Please fill in all required fields");
      return;
    }

    setSending(true);
    setSendProgress("Creating campaign...");

    try {
      const subjectRotation = useSubjectRotation
        ? subjects.filter((s) => s.trim() !== "")
        : [];

      // Template rotation: array of template IDs (includes the primary one)
      const templateRotation = useTemplateRotation && selectedTemplateIds.length > 0
        ? selectedTemplateIds
        : (form.template_id ? [form.template_id] : []);

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduled_at: action === "schedule" ? form.scheduled_at : null,
          reply_to: form.reply_to || null,
          subject_rotation: subjectRotation.length > 0 ? subjectRotation : null,
          template_rotation: templateRotation.length > 1 ? templateRotation : null,
          enable_tracking: form.enable_tracking,
          enable_unsubscribe: form.enable_unsubscribe,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      if (action === "send") {
        setSendProgress("Queuing emails...");

        const patchRes = await fetch(`/api/campaigns/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send" }),
        });
        const patchData = await patchRes.json();

        if (!patchData.success) throw new Error(patchData.error);

        // Start SSE streaming
        startStreaming(data.id, patchData.queued);
      } else {
        setSendProgress("Campaign scheduled! ✅ It will be auto-sent when the scheduled time arrives.");
        setTimeout(() => router.push("/history"), 1500);
      }
    } catch (error: any) {
      setSendProgress(`Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const selectedList = lists.find((l) => l.id === form.contact_list_id);
  const selectedTemplate = templates.find((t) => t.id === form.template_id);
  const activeSubjects = useSubjectRotation ? subjects.filter((s) => s.trim()) : [];

  // Progress percentage
  const progressPct = totalEmails > 0
    ? Math.round(((displaySent + displayFailed + displaySkipped) / totalEmails) * 100)
    : 0;

  return (
    <div style={{ maxWidth: "700px" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Compose Campaign</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
          Create and send a bulk email campaign
        </p>
      </div>

      {/* ─── Active Campaign Banner ─────────────────────── */}
      {activeCampaign && !sendLoopActive && (
        <div className="card" style={{
          marginBottom: "1rem",
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "1rem", padding: "0.875rem 1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.25rem" }}>📤</span>
            <div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Campaign "{activeCampaign.name}" is still sending
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {activeCampaign.sent_count || 0} sent, {activeCampaign.failed_count || 0} failed, {activeCampaign.total_count - (activeCampaign.sent_count || 0) - (activeCampaign.failed_count || 0)} remaining
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => reconnectToCampaign(activeCampaign)}
            style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
            ▶ Resume Sending
          </button>
        </div>
      )}

      {/* ─── Connectivity Banner ──────────────────────────── */}
      {!isOnline && (
        <div className="card" style={{
          marginBottom: "1rem",
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem",
        }}>
          <span style={{ fontSize: "1.25rem" }}>🌐❌</span>
          <div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--danger)" }}>No Internet Connection</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              Sending is paused automatically. It will resume when your connection is restored.
            </div>
          </div>
        </div>
      )}

      {/* ─── Pause Banner ─────────────────────────────────── */}
      {isPaused && sendLoopActive && (
        <div className="card" style={{
          marginBottom: "1rem",
          background: "rgba(234, 179, 8, 0.08)",
          border: "1px solid rgba(234, 179, 8, 0.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.875rem 1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.25rem" }}>⏸</span>
            <div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Sending Paused</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {displayRemaining} emails remaining — they are saved and safe.
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={resumeSending}
            style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
            ▶ Resume
          </button>
        </div>
      )}

      {/* ─── Scheduler Status ─────────────────────────────── */}
      {schedulerStatus?.scheduler?.running && (
        <div className="card" style={{
          marginBottom: "1.5rem",
          background: isPaused ? "rgba(234, 179, 8, 0.05)" : "rgba(34, 197, 94, 0.05)",
          border: `1px solid ${isPaused ? "rgba(234, 179, 8, 0.2)" : "rgba(34, 197, 94, 0.2)"}`,
          display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem",
        }}>
          <span style={{ fontSize: "1.25rem" }}>{isPaused ? "⏸" : "⏰"}</span>
          <div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
              {isPaused ? "Scheduler Paused" : "Auto-Send Scheduler Active"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {isPaused
                ? "No emails are being sent. Click Resume to continue."
                : "Background scheduler is running — checking every 30s for scheduled campaigns."}
            </div>
          </div>
        </div>
      )}

      {/* ─── Campaign Form ────────────────────────────────── */}
      {!sendLoopActive && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Campaign Name */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Campaign Name *
              </label>
              <input className="input" placeholder="e.g., Monthly Newsletter - August 2026"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            {/* Template */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Email Template *
              </label>
              <select className="input" value={form.template_id}
                onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {selectedTemplate && (
                <TemplatePreview template={selectedTemplate} />
              )}
            </div>

            {/* Template Rotation */}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>🔄 Template Rotation</label>
                <button type="button" onClick={() => {
                  setUseTemplateRotation(!useTemplateRotation);
                  if (!useTemplateRotation && form.template_id) {
                    setSelectedTemplateIds([form.template_id]);
                  }
                }}
                  style={{
                    padding: "0.25rem 0.75rem", borderRadius: "1rem", border: "none",
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                    background: useTemplateRotation ? "var(--accent)" : "var(--border)",
                    color: useTemplateRotation ? "#fff" : "var(--muted)", transition: "all 0.2s",
                  }}>
                  {useTemplateRotation ? "ON" : "OFF"}
                </button>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
                Send different email content to each recipient. Each person gets a different message and subject line.
              </p>
              {useTemplateRotation && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: "0.5rem",
                  padding: "0.75rem", borderRadius: "0.5rem",
                  border: "1px solid var(--border)", background: "rgba(99, 102, 241, 0.03)",
                }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Select templates to rotate (each recipient gets one):
                  </div>
                  {templates.map((t) => {
                    const isSelected = selectedTemplateIds.includes(t.id);
                    const isPrimary = t.id === form.template_id;
                    return (
                      <label key={t.id} style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                        border: `1px solid ${isSelected ? "rgba(99, 102, 241, 0.3)" : "var(--border)"}`,
                        background: isSelected ? "rgba(99, 102, 241, 0.06)" : "transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedTemplateIds(prev => prev.filter(id => id !== t.id));
                            } else {
                              setSelectedTemplateIds(prev => [...prev, t.id]);
                            }
                          }}
                          style={{ accentColor: "var(--accent)", width: "16px", height: "16px" }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                            {t.name} {isPrimary && <span style={{ fontSize: "0.65rem", color: "var(--accent)" }}>(primary)</span>}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                            Subject: {t.subject?.substring(0, 50)}{t.subject?.length > 50 ? "..." : ""}
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{
                            fontSize: "0.65rem", padding: "0.125rem 0.5rem", borderRadius: "0.75rem",
                            background: "rgba(99, 102, 241, 0.15)", color: "var(--accent)", fontWeight: 600,
                          }}>
                            #{selectedTemplateIds.indexOf(t.id) + 1}
                          </span>
                        )}
                      </label>
                    );
                  })}
                  {selectedTemplateIds.length > 0 && (
                    <p style={{ fontSize: "0.7rem", color: "var(--success)", marginTop: "0.25rem" }}>
                      ✅ {selectedTemplateIds.length} template{selectedTemplateIds.length !== 1 ? "s" : ""} selected — emails will be distributed evenly across them
                    </p>
                  )}
                  {selectedTemplateIds.length === 0 && (
                    <p style={{ fontSize: "0.7rem", color: "rgb(234, 179, 8)", marginTop: "0.25rem" }}>
                      ⚠️ Select at least 2 templates to enable rotation
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Contact List */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Contact List *
              </label>
              <select className="input" value={form.contact_list_id}
                onChange={(e) => setForm({ ...form, contact_list_id: e.target.value })}>
                <option value="">Select a contact list...</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.member_count} contacts)</option>
                ))}
              </select>
            </div>

            {/* Reply-To */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Reply-To Email
              </label>
              <input className="input" type="email" placeholder="e.g., replies@yourcompany.com"
                value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                When recipients hit &quot;Reply&quot;, their response goes to this address. Leave empty to use the default.
              </p>
            </div>

            {/* Subject Rotation */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500 }}>Subject Line Rotation</label>
                <button type="button" onClick={() => setUseSubjectRotation(!useSubjectRotation)}
                  style={{
                    padding: "0.25rem 0.75rem", borderRadius: "1rem", border: "none",
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                    background: useSubjectRotation ? "var(--accent)" : "var(--border)",
                    color: useSubjectRotation ? "#fff" : "var(--muted)", transition: "all 0.2s",
                  }}>
                  {useSubjectRotation ? "ON" : "OFF"}
                </button>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                Rotate between multiple subject lines to improve open rates.
              </p>
              {useSubjectRotation && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {subjects.map((subject, index) => (
                    <div key={index} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{
                        minWidth: "1.5rem", height: "1.5rem", borderRadius: "50%",
                        background: "var(--accent)", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
                      }}>{index + 1}</span>
                      <input className="input" placeholder={`Subject variation ${index + 1}`}
                        value={subject} onChange={(e) => updateSubject(index, e.target.value)} style={{ flex: 1 }} />
                      {subjects.length > 1 && (
                        <button type="button" onClick={() => removeSubject(index)}
                          style={{
                            width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem", border: "none",
                            background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)",
                            cursor: "pointer", fontSize: "1rem",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addSubject}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.375rem",
                      padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                      border: "1px dashed var(--border)", background: "transparent",
                      color: "var(--accent)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 500,
                    }}>+ Add Subject Variation</button>
                  {activeSubjects.length > 0 && (
                    <p style={{ fontSize: "0.75rem", color: "var(--success)", marginTop: "0.25rem" }}>
                      ✓ {activeSubjects.length} subject{activeSubjects.length !== 1 ? "s" : ""} configured
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Tracking & Compliance */}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>📊 Tracking & Compliance</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <button type="button" onClick={() => setForm({ ...form, enable_tracking: !form.enable_tracking })}
                    style={{
                      width: "44px", height: "24px", borderRadius: "12px", border: "none",
                      background: form.enable_tracking ? "var(--accent)" : "var(--border)",
                      cursor: "pointer", position: "relative", transition: "background 0.2s",
                      flexShrink: 0, marginTop: "2px",
                    }}>
                    <span style={{
                      position: "absolute", top: "2px",
                      left: form.enable_tracking ? "22px" : "2px",
                      width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </button>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>Open Tracking {form.enable_tracking ? "✅" : "⏸"}</div>
                    <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                      Embeds an invisible pixel to track when recipients open the email.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <button type="button" onClick={() => setForm({ ...form, enable_unsubscribe: !form.enable_unsubscribe })}
                    style={{
                      width: "44px", height: "24px", borderRadius: "12px", border: "none",
                      background: form.enable_unsubscribe ? "var(--success)" : "var(--border)",
                      cursor: "pointer", position: "relative", transition: "background 0.2s",
                      flexShrink: 0, marginTop: "2px",
                    }}>
                    <span style={{
                      position: "absolute", top: "2px",
                      left: form.enable_unsubscribe ? "22px" : "2px",
                      width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </button>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>Unsubscribe Link {form.enable_unsubscribe ? "✅" : "⏸"}</div>
                    <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                      Adds an &quot;unsubscribe&quot; link and RFC 2369 header. <strong>Recommended: ON</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Delay */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Delay Between Emails (seconds)
              </label>
              <input className="input" type="number" min="0" max="60" style={{ width: "120px" }}
                value={form.delay_seconds}
                onChange={(e) => setForm({ ...form, delay_seconds: parseInt(e.target.value) || 0 })} />
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                Helps avoid spam filters. 0 = no delay, 2-5 recommended.
              </p>
            </div>

            {/* Schedule */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.375rem" }}>
                Schedule (optional)
              </label>
              <input className="input" type="datetime-local" style={{ width: "280px" }}
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                Leave empty to send immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Campaign Summary ─────────────────────────────── */}
      {selectedList && !sendLoopActive && (
        <div className="card" style={{ marginBottom: "1.5rem", background: "rgba(59, 130, 246, 0.05)" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>📋 Campaign Summary</h3>
          <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div><span style={{ color: "var(--muted)" }}>Recipients:</span> {selectedList.member_count} contacts</div>
            <div><span style={{ color: "var(--muted)" }}>Delay:</span> {form.delay_seconds}s between emails</div>
            {form.reply_to && <div><span style={{ color: "var(--muted)" }}>Reply-To:</span> {form.reply_to}</div>}
            {useSubjectRotation && activeSubjects.length > 0 && (
              <div><span style={{ color: "var(--muted)" }}>Subject Rotation:</span> {activeSubjects.length} variations</div>
            )}
            {useTemplateRotation && selectedTemplateIds.length > 1 && (
              <div><span style={{ color: "var(--muted)" }}>Template Rotation:</span> {selectedTemplateIds.length} templates (each recipient gets a different message)</div>
            )}
            <div><span style={{ color: "var(--muted)" }}>Tracking:</span> {form.enable_tracking ? "✅ Open tracking" : "⏸ Disabled"}</div>
            <div><span style={{ color: "var(--muted)" }}>Compliance:</span> {form.enable_unsubscribe ? "✅ Unsubscribe link" : "⏸ No link"}</div>
            {form.scheduled_at && (
              <div><span style={{ color: "var(--muted)" }}>Scheduled:</span> 📅 {new Date(form.scheduled_at).toLocaleString()}</div>
            )}
            <div><span style={{ color: "var(--muted)" }}>Estimated time:</span> {Math.ceil((selectedList.member_count * form.delay_seconds) / 60)} min</div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ─── REAL-TIME SENDING DASHBOARD ───────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {sendLoopActive && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          {/* Progress bar */}
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                {isComplete ? "✅ Complete" : isPaused ? "⏸ Paused" : "📤 Sending..."}
              </span>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                {progressPct}%
              </span>
            </div>
            <div style={{
              height: "10px", borderRadius: "5px", background: "var(--border)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: "5px",
                background: isComplete
                  ? "var(--success)"
                  : isPaused
                  ? "rgba(234, 179, 8, 0.7)"
                  : "var(--accent)",
                width: `${progressPct}%`,
                transition: "width 0.15s ease-out",
              }} />
            </div>
          </div>

          {/* Stats cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}>
            <div style={{
              padding: "0.75rem", borderRadius: "0.5rem",
              background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.2)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>{displaySent}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 500 }}>Sent</div>
            </div>
            <div style={{
              padding: "0.75rem", borderRadius: "0.5rem",
              background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--danger)" }}>{displayFailed}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 500 }}>Failed</div>
            </div>
            <div style={{
              padding: "0.75rem", borderRadius: "0.5rem",
              background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.2)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "rgb(234, 179, 8)" }}>{displaySkipped}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 500 }}>Skipped</div>
            </div>
            <div style={{
              padding: "0.75rem", borderRadius: "0.5rem",
              background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{displayRemaining}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 500 }}>Remaining</div>
            </div>
          </div>

          {/* ─── Speed Metrics ──────────────────────────────── */}
          {emailsPerMin > 0 && !isComplete && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem",
              marginBottom: "0.75rem",
            }}>
              <div style={{
                padding: "0.625rem", borderRadius: "0.5rem", textAlign: "center",
                background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)",
              }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "rgb(59, 130, 246)" }}>
                  ⚡ {emailsPerMin}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--muted)", fontWeight: 500 }}>emails/min</div>
              </div>
              <div style={{
                padding: "0.625rem", borderRadius: "0.5rem", textAlign: "center",
                background: etaSeconds > 0 ? "rgba(168, 85, 247, 0.08)" : "rgba(107, 114, 128, 0.08)",
                border: `1px solid ${etaSeconds > 0 ? "rgba(168, 85, 247, 0.2)" : "rgba(107, 114, 128, 0.2)"}`,
              }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: etaSeconds > 0 ? "rgb(168, 85, 247)" : "var(--muted)" }}>
                  ⏱️ {etaSeconds > 0 ? (etaSeconds < 60 ? `${etaSeconds}s` : etaSeconds < 3600 ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s` : `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`) : "—"}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--muted)", fontWeight: 500 }}>ETA</div>
              </div>
              <div style={{
                padding: "0.625rem", borderRadius: "0.5rem", textAlign: "center",
                background: "rgba(107, 114, 128, 0.08)", border: "1px solid rgba(107, 114, 128, 0.2)",
              }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--muted)" }}>
                  ⏳ {elapsedTime < 60 ? `${elapsedTime}s` : elapsedTime < 3600 ? `${Math.floor(elapsedTime / 60)}m ${elapsedTime % 60}s` : `${Math.floor(elapsedTime / 3600)}h ${Math.floor((elapsedTime % 3600) / 60)}m`}
                </div>
                <div style={{ fontSize: "0.6rem", color: "var(--muted)", fontWeight: 500 }}>elapsed</div>
              </div>
            </div>
          )}

          {/* Last email detail */}
          {lastEmail && (
            <div style={{
              padding: "0.625rem 0.75rem", borderRadius: "0.5rem",
              background: "var(--background)", fontSize: "0.8rem",
              display: "flex", alignItems: "center", gap: "0.5rem",
              marginBottom: "0.75rem",
            }}>
              <span style={{
                display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
                background: lastStatus === "sent" ? "var(--success)" : lastStatus === "failed" ? "var(--danger)" : "rgb(234, 179, 8)",
                animation: !isComplete && !isPaused ? "pulse 1s ease-in-out infinite" : "none",
                flexShrink: 0,
              }} />
              <span style={{ color: "var(--muted)" }}>Last:</span>
              <span style={{ fontWeight: 500 }}>{lastEmail}</span>
              <span style={{
                fontSize: "0.7rem", padding: "0.125rem 0.5rem", borderRadius: "0.75rem",
                background: lastStatus === "sent" ? "rgba(34, 197, 94, 0.15)" : lastStatus === "failed" ? "rgba(239, 68, 68, 0.15)" : "rgba(234, 179, 8, 0.15)",
                color: lastStatus === "sent" ? "var(--success)" : lastStatus === "failed" ? "var(--danger)" : "rgb(234, 179, 8)",
                fontWeight: 600,
              }}>
                {lastStatus === "sent" ? "✅ Sent" : lastStatus === "failed" ? "❌ Failed" : "⏭ Skipped"}
              </span>
              {lastError && lastStatus === "failed" && (
                <span style={{ fontSize: "0.7rem", color: "var(--danger)", marginLeft: "auto" }}>
                  {lastError.length > 50 ? lastError.substring(0, 50) + "..." : lastError}
                </span>
              )}
            </div>
          )}

          {/* ─── Live Email Log ─────────────────────────────── */}
          {logEntries.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "0.5rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>📋 Live Log</span>
                  <span style={{
                    fontSize: "0.65rem", padding: "0.125rem 0.5rem", borderRadius: "0.75rem",
                    background: "var(--border)", color: "var(--muted)", fontWeight: 500,
                  }}>{logEntries.length} entries</span>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {(["all", "sent", "failed", "skipped"] as const).map((f) => (
                    <button key={f} onClick={() => setLogFilter(f)} style={{
                      padding: "0.175rem 0.5rem", borderRadius: "0.75rem", border: "none",
                      fontSize: "0.65rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                      background: logFilter === f
                        ? (f === "sent" ? "rgba(34, 197, 94, 0.2)" : f === "failed" ? "rgba(239, 68, 68, 0.2)" : f === "skipped" ? "rgba(234, 179, 8, 0.2)" : "rgba(99, 102, 241, 0.2))")
                        : "transparent",
                      color: logFilter === f
                        ? (f === "sent" ? "var(--success)" : f === "failed" ? "var(--danger)" : f === "skipped" ? "rgb(234, 179, 8)" : "var(--accent)")
                        : "var(--muted)",
                    }}>
                      {f === "all" ? "All" : f === "sent" ? `✅ Sent` : f === "failed" ? `❌ Failed` : `⏭ Skip`}
                    </button>
                  ))}
                  <button onClick={() => { autoScrollRef.current = !autoScrollRef.current; }} style={{
                    padding: "0.175rem 0.5rem", borderRadius: "0.75rem", border: "none",
                    fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
                    background: autoScrollRef.current ? "rgba(34, 197, 94, 0.15)" : "transparent",
                    color: autoScrollRef.current ? "var(--success)" : "var(--muted)",
                    marginLeft: "0.25rem",
                  }}>
                    {autoScrollRef.current ? "⬇ Auto" : "⏸ Paused"}
                  </button>
                </div>
              </div>
              <div
                ref={logContainerRef}
                onScroll={() => {
                  if (!logContainerRef.current) return;
                  const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
                  autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 30;
                }}
                style={{
                  maxHeight: "200px", overflowY: "auto",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  fontFamily: "monospace", fontSize: "0.7rem",
                }}>
                {logEntries
                  .filter((e) => logFilter === "all" || e.status === logFilter)
                  .map((entry) => (
                    <div key={entry.id} style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.25rem 0.625rem",
                      borderBottom: "1px solid var(--border)",
                      color: entry.status === "sent"
                        ? "var(--success)"
                        : entry.status === "failed"
                        ? "var(--danger)"
                        : "rgb(234, 179, 8)",
                    }}>
                      <span style={{ color: "var(--muted)", flexShrink: 0, width: "65px" }}>
                        {entry.time}
                      </span>
                      <span style={{ flexShrink: 0 }}>
                        {entry.status === "sent" ? "✅" : entry.status === "failed" ? "❌" : "⏭"}
                      </span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.email}
                      </span>
                      {entry.error && (
                        <span style={{ color: "var(--danger)", fontSize: "0.6rem", flexShrink: 0, maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.error}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Progress message */}
          {sendProgress && (
            <div style={{
              padding: "0.625rem 0.75rem", borderRadius: "0.5rem",
              background: sendProgress.includes("❌") || sendProgress.includes("Error")
                ? "rgba(239, 68, 68, 0.05)"
                : sendProgress.includes("⏸")
                ? "rgba(234, 179, 8, 0.05)"
                : sendProgress.includes("✅")
                ? "rgba(34, 197, 94, 0.05)"
                : "transparent",
              border: `1px solid ${
                sendProgress.includes("❌") || sendProgress.includes("Error")
                  ? "var(--danger)"
                  : sendProgress.includes("⏸")
                  ? "rgba(234, 179, 8, 0.3)"
                  : sendProgress.includes("✅")
                  ? "var(--success)"
                  : "var(--border)"
              }`,
              fontSize: "0.8rem",
            }}>
              {sendProgress}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", alignItems: "center" }}>
            {!isComplete && (
              <>
                {!isPaused ? (
                  <button className="btn btn-secondary" onClick={pauseSending}
                    style={{
                      fontSize: "0.8rem", padding: "0.5rem 1rem",
                      borderColor: "rgba(234, 179, 8, 0.5)", color: "rgb(234, 179, 8)",
                    }}>⏸ Pause</button>
                ) : (
                  <button className="btn btn-primary" onClick={resumeSending}
                    style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>▶ Resume</button>
                )}
              </>
            )}
            <button className="btn btn-secondary" onClick={() => router.push("/history")}
              style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", marginLeft: "auto" }}>
              View History →
            </button>
          </div>
        </div>
      )}

      {/* ─── Send Button ──────────────────────────────────── */}
      {!sendLoopActive && (
        <div style={{ display: "flex", gap: "1rem" }}>
          <button className="btn btn-primary" onClick={() => handleSend("send")}
            disabled={sending || isPaused} style={{ opacity: sending || isPaused ? 0.6 : 1 }}>
            {sending ? "⏳ Sending..." : "🚀 Send Now"}
          </button>
          {form.scheduled_at && (
            <button className="btn btn-secondary" onClick={() => handleSend("schedule")}
              disabled={sending || isPaused} style={{ opacity: sending || isPaused ? 0.6 : 1 }}>
              📅 Schedule
            </button>
          )}
        </div>
      )}

      {/* Pulse animation for live indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}
