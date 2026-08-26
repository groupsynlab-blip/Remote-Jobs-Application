"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/activity", label: "Activity", icon: "⚡" },
  { href: "/compose", label: "Compose", icon: "✏️" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
  { href: "/templates", label: "Templates", icon: "📝" },
  { href: "/verify", label: "Verifier", icon: "🔍" },
  { href: "/scraper", label: "Scraper", icon: "🕷️" },
  { href: "/history", label: "History", icon: "📋" },
  { href: "/landing-pages", label: "Landing Pages", icon: "📄" },
  { href: "/warmup", label: "Warmup", icon: "🔥" },
  { href: "/ab-tests", label: "A/B Tests", icon: "🔬" },
  { href: "/smtp-health", label: "SMTP Health", icon: "🩺" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <>
      <style>{`
        .sidebar-nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.625rem 1.25rem;
          margin: 0.125rem 0.5rem;
          border-radius: 0.625rem;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.55);
          text-decoration: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }
        .sidebar-nav-item:hover {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(255, 255, 255, 0.08);
        }
        .sidebar-nav-item.active {
          color: #ffffff;
          background: rgba(99, 102, 241, 0.25);
          font-weight: 600;
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
        .sidebar-nav-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 60%;
          background: linear-gradient(180deg, #818cf8, #6366f1);
          border-radius: 0 2px 2px 0;
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.6);
        }
        .sidebar-icon {
          font-size: 1.1rem;
          width: 1.5rem;
          text-align: center;
          transition: transform 0.2s;
        }
        .sidebar-nav-item:hover .sidebar-icon {
          transform: scale(1.15);
        }
        .sidebar-nav-item.active .sidebar-icon {
          filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.5));
        }
      `}</style>

      <aside
        style={{
          width: "240px",
          minHeight: "100vh",
          background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #3730a3 100%)",
          padding: "1.25rem 0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle mesh gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 20% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{
          padding: "0.5rem 1.5rem 1.5rem",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "0.625rem",
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.1rem", boxShadow: "0 2px 10px rgba(99, 102, 241, 0.4)",
            }}>
              📧
            </div>
            <div>
              <h1 style={{ fontSize: "1rem", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                Bulk Emailer
              </h1>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", marginTop: "0.125rem" }}>
                Send emails at scale
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: "0.75rem 0", flex: 1, position: "relative" }}>
          <div style={{ padding: "0.25rem 1.5rem 0.5rem", fontSize: "0.6rem", fontWeight: 600, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Navigation
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                onMouseEnter={() => setHoveredItem(item.href)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "0.75rem 1.5rem 0" }}>
          <button
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              window.location.href = "/login";
            }}
            style={{
              width: "100%",
              padding: "0.55rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "#f87171",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>🚪</span>
            <span>Logout</span>
          </button>
        </div>

        {/* Footer */}
        <div style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          fontSize: "0.65rem",
          color: "rgba(255, 255, 255, 0.25)",
          position: "relative",
        }}>
          v1.0.0
        </div>
      </aside>
    </>
  );
}
