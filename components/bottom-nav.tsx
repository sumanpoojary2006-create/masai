"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase-browser";

const STORAGE_KEY = "masai-theme";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const t = stored === "dark" ? "dark" : "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    setMounted(true);
  }, []);

  function toggleTheme() {
    const next: "light" | "dark" = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
  }

  async function handleLogout() {
    setLoggingOut(true);
    const isAdmin = document.cookie.includes("admin_session=true");
    if (isAdmin) {
      document.cookie = "admin_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/login";
      return;
    }
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const navItems = [
    {
      label: "LO Tracker",
      href: "/lo-tracker",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      label: "Weekly Report",
      href: "/weekly-report",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      label: "Profile",
      href: "/profile",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        bottom: "1.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "rgba(8, 12, 22, 0.94)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "9999px",
        padding: "6px 8px",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        gap: "2px",
        whiteSpace: "nowrap",
      }}
    >
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              padding: "8px 18px",
              borderRadius: "9999px",
              color: active ? "#ffffff" : "#64748b",
              background: active ? "rgba(255,255,255,0.1)" : "transparent",
              transition: "all 0.15s",
              textDecoration: "none",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.03em",
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}

      {/* Divider */}
      <div
        style={{
          width: "1px",
          height: "28px",
          background: "rgba(255,255,255,0.12)",
          margin: "0 6px",
          flexShrink: 0,
        }}
      />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          padding: "8px 18px",
          borderRadius: "9999px",
          color: "#64748b",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "all 0.15s",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.03em",
        }}
      >
        {mounted && theme === "light" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
        <span>{mounted ? (theme === "light" ? "Dark Mode" : "Light Mode") : "Theme"}</span>
      </button>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          padding: "8px 18px",
          borderRadius: "9999px",
          color: loggingOut ? "#475569" : "#64748b",
          background: "transparent",
          border: "none",
          cursor: loggingOut ? "not-allowed" : "pointer",
          transition: "all 0.15s",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.03em",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>{loggingOut ? "..." : "Logout"}</span>
      </button>
    </nav>
  );
}
