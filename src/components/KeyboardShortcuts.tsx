"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K — open command palette (navigate to compose)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        router.push("/compose");
      }
      // Ctrl+D — dark mode toggle
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "theme", value: next }) });
      }
      // Ctrl+1-6 — navigate to pages
      if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const pages = ["/compose", "/scraper", "/verify", "/history", "/settings", "/activity"];
        const idx = parseInt(e.key) - 1;
        if (idx < pages.length) router.push(pages[idx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
