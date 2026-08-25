"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a, #1e293b, #334155)" }}>
          <div style={{ color: "#94a3b8" }}>Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

type Mode = "login" | "recovery-code" | "forgot";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState("");
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  // ── Login ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.recoveryCode) {
          // First time — show recovery code
          setRecoveryCode(data.recoveryCode);
          setMode("recovery-code");
        } else {
          window.location.href = from;
        }
      } else {
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Connection error. Please try again.");
    }
    setLoading(false);
  };

  // ── Forgot Password ──
  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !newPassword.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryCode: resetCode, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewRecoveryCode(data.newRecoveryCode);
        setResetDone(true);
      } else {
        setError(data.error || "Recovery failed");
      }
    } catch {
      setError("Connection error. Please try again.");
    }
    setLoading(false);
  };

  // ── Recovery code display ──
  if (mode === "recovery-code") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div style={{ ...iconBoxStyle, background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>🔑</div>
            <h1 style={{ color: "#f1f5f9", fontSize: "1.4rem", fontWeight: 700, margin: "0 0 0.3rem" }}>Save Your Recovery Code</h1>
            <p style={{ color: "#94a3b8", fontSize: "0.8rem", margin: 0, lineHeight: 1.5 }}>
              If you forget your password, this code is your only way back in.<br />
              <strong style={{ color: "#f59e0b" }}>Write it down somewhere safe!</strong>
            </p>
          </div>

          <div style={{
            padding: "1rem", borderRadius: "0.5rem", marginBottom: "1.25rem",
            background: "rgba(15, 23, 42, 0.6)", border: "2px dashed rgba(34, 197, 94, 0.5)",
            textAlign: "center",
          }}>
            <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Your Recovery Code</div>
            <div style={{ color: "#4ade80", fontSize: "1.3rem", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.15em", wordBreak: "break-all" }}>
              {recoveryCode}
            </div>
          </div>

          <div style={{
            padding: "0.75rem", borderRadius: "0.5rem", marginBottom: "1.25rem",
            background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "#f87171", fontSize: "0.78rem", lineHeight: 1.5,
          }}>
            ⚠️ If you lose this code and forget your password, you will be permanently locked out. There is no other way to recover access.
          </div>

          <button
            onClick={() => window.location.href = from}
            style={{
              width: "100%", padding: "0.8rem", borderRadius: "0.5rem", border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
              color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
            }}
          >
            ✅ I&apos;ve Saved It — Continue to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Forgot password form ──
  if (mode === "forgot") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div style={{ ...iconBoxStyle, background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>🔓</div>
            <h1 style={{ color: "#f1f5f9", fontSize: "1.4rem", fontWeight: 700, margin: "0 0 0.3rem" }}>Reset Password</h1>
            <p style={{ color: "#64748b", fontSize: "0.8rem", margin: 0 }}>Enter your recovery code and set a new password</p>
          </div>

          {error && <div style={errorStyle}>❌ {error}</div>}

          {resetDone ? (
            <>
              <div style={{
                padding: "0.75rem 1rem", borderRadius: "0.5rem", marginBottom: "1rem",
                background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)",
                color: "#4ade80", fontSize: "0.85rem",
              }}>
                ✅ Password reset successful! Your new recovery code:
              </div>
              <div style={{
                padding: "0.75rem", borderRadius: "0.5rem", marginBottom: "1.25rem",
                background: "rgba(15, 23, 42, 0.6)", border: "2px dashed rgba(34, 197, 94, 0.5)",
                textAlign: "center",
              }}>
                <div style={{ color: "#64748b", fontSize: "0.65rem", marginBottom: "0.2rem", textTransform: "uppercase" }}>New Recovery Code</div>
                <div style={{ color: "#4ade80", fontSize: "1.1rem", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.1em" }}>{newRecoveryCode}</div>
              </div>
              <button onClick={() => window.location.href = from} style={btnStyle}>
                ✅ Go to Dashboard
              </button>
            </>
          ) : (
            <form onSubmit={handleRecover}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>Recovery Code</label>
                <input
                  type="text" autoFocus value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="e.g. DELTA-1234-NOVEMBER-5678"
                  style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.05em" }}
                />
              </div>
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password" value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password..."
                  style={inputStyle}
                />
              </div>
              <button type="submit" disabled={loading || !resetCode.trim() || !newPassword.trim()} style={{ ...btnStyle, opacity: loading || !resetCode.trim() || !newPassword.trim() ? 0.6 : 1 }}>
                {loading ? "⏳ Resetting..." : "🔓 Reset Password"}
              </button>
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
            <button onClick={() => { setMode("login"); setError(""); setResetCode(""); setNewPassword(""); setResetDone(false); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}>
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Login form ──
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={iconBoxStyle}>📧</div>
          <h1 style={{ color: "#f1f5f9", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.3rem" }}>Bulk Emailer</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>Enter your password to access the dashboard</p>
        </div>

        {error && <div style={errorStyle}>❌ {error}</div>}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password" autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              style={inputStyle}
            />
            <p style={{ color: "#475569", fontSize: "0.7rem", marginTop: "0.5rem", lineHeight: 1.4 }}>
              First time? Your password will be set when you log in. Remember it — you&apos;ll need it every time.
            </p>
          </div>

          <button type="submit" disabled={loading || !password.trim()} style={{ ...btnStyle, opacity: loading || !password.trim() ? 0.6 : 1 }}>
            {loading ? "⏳ Verifying..." : "🔐 Login"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button onClick={() => { setMode("forgot"); setError(""); setPassword(""); }} style={{ background: "none", border: "none", color: "#818cf8", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}>
            🔑 Forgot Password?
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──
const pageStyle: React.CSSProperties = {
  minHeight: "100vh", background: "linear-gradient(135deg, #0f172a, #1e293b, #334155)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};
const cardStyle: React.CSSProperties = {
  maxWidth: "420px", width: "100%", padding: "2.5rem",
  background: "rgba(30, 41, 59, 0.8)", backdropFilter: "blur(20px)",
  border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "1rem",
  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
};
const iconBoxStyle: React.CSSProperties = {
  width: "64px", height: "64px", borderRadius: "16px",
  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  margin: "0 auto 1rem", fontSize: "1.8rem",
  boxShadow: "0 0 25px rgba(99, 102, 241, 0.4)",
};
const labelStyle: React.CSSProperties = {
  display: "block", color: "#94a3b8", fontSize: "0.75rem",
  fontWeight: 600, marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "0.5rem",
  border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "0.9rem",
  background: "rgba(15, 23, 42, 0.6)", color: "#e2e8f0", outline: "none", boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  width: "100%", padding: "0.8rem", borderRadius: "0.5rem", border: "none",
  background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
  color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
  boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
};
const errorStyle: React.CSSProperties = {
  padding: "0.75rem 1rem", borderRadius: "0.5rem", marginBottom: "1.25rem",
  background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)",
  color: "#f87171", fontSize: "0.85rem",
};
