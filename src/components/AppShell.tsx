"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

// Paths that don't show sidebar (login, public landing pages)
const NO_SIDEBAR_PATHS = ["/login", "/landing-pages/public"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const hideSidebar =
    pathname === "/login" ||
    NO_SIDEBAR_PATHS.some((p) => pathname.startsWith(p));

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main
        className="flex-1 overflow-auto"
        style={{
          padding: "2rem 2.5rem",
          background:
            "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e8edf5 100%)",
          minHeight: "100vh",
        }}
      >
        {children}
      </main>
    </>
  );
}
