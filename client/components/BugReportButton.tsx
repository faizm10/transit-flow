"use client";

import { useState } from "react";
import { Bug } from "lucide-react";
import BugReportModal from "./BugReportModal";

interface Props {
  /** Visual variant — "nav" for header links, "float" for the map overlay */
  variant?: "nav" | "float";
}

export default function BugReportButton({ variant = "nav" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "float" ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-500 shadow-md backdrop-blur-sm transition-colors hover:border-slate-300 hover:text-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current opacity-60" aria-hidden>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
          </svg>
          Report a bug
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="ml-1 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-[var(--landing-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--landing-fg)_5%,var(--landing-bg))] hover:text-[var(--landing-fg)] outline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
        >
          <Bug className="h-3.5 w-3.5" aria-hidden />
          Report a bug
        </button>
      )}

      <BugReportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
