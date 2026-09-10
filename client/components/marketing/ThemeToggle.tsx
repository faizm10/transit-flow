"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Flips `.dark` / `.light` on <html> and remembers the choice in localStorage
 * (key `tf-theme`). With no stored choice the page follows the OS setting via
 * the `prefers-color-scheme` media query in globals.css. The no-flash init
 * script lives in app/layout.tsx.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains("light")
      ? false
      : root.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    setReady(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    const c = document.documentElement.classList;
    c.toggle("dark", next);
    c.toggle("light", !next);
    try {
      localStorage.setItem("tf-theme", next ? "dark" : "light");
    } catch {
      /* private mode — session-only toggle is fine */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={`inline-flex h-7 w-7 items-center justify-center text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink)] ${className}`}
    >
      {ready && dark ? (
        <Sun className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Moon className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
