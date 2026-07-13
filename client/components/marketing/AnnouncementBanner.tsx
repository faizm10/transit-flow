"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";

const BANNER_DISMISSED_KEY = "tf_banner_dismissed_v1";

export default function AnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
      if (!dismissed) setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(BANNER_DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="relative z-40 flex items-center justify-center gap-3 border-b border-[var(--landing-accent)]/20 bg-[var(--landing-accent)]/5 px-4 py-2.5 text-sm">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--landing-accent)]" aria-hidden />
      <p className="text-[var(--landing-fg)]">
        <span className="font-semibold text-[var(--landing-accent)]">New:</span>{" "}
        Upload any city&apos;s GTFS feed, sign in with Google to save your feeds, and explore city transit alongside GO Transit.{" "}
        <Link
          href="/changelog"
          className="underline underline-offset-2 hover:text-[var(--landing-accent)] transition-colors"
        >
          See what&apos;s new →
        </Link>
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="ml-auto shrink-0 rounded-md p-0.5 text-[var(--landing-muted)] hover:text-[var(--landing-fg)] transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
