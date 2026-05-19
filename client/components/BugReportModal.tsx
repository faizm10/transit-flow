"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { X, Bug, Loader2, CheckCircle2, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BugReportModal({ open, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ issueUrl: string; issueNumber: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-fill current page URL on open
  useEffect(() => {
    if (open) {
      setPage(window.location.href);
      setTitle("");
      setDescription("");
      setError(null);
      setResult(null);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Please give the bug a short title."); return; }
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), page }),
      });
      const data = await res.json() as { ok?: boolean; issueUrl?: string; issueNumber?: number; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult({ issueUrl: data.issueUrl!, issueNumber: data.issueNumber! });
    });
  }

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Report a bug</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-[#007A33]" />
            <div>
              <p className="font-semibold text-gray-900">Bug reported — thank you!</p>
              <p className="mt-1 text-sm text-gray-500">
                Issue #{result.issueNumber} has been created on GitHub.
              </p>
            </div>
            <a
              href={result.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#007A33] hover:underline"
            >
              View issue <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
            <p className="text-sm text-gray-500">
              Found something broken? Fill this out and we&apos;ll look into it — no account needed.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="bug-title" className="text-xs font-medium text-gray-700">
                What went wrong? <span className="text-red-500">*</span>
              </label>
              <input
                ref={titleRef}
                id="bug-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. Map doesn't load on mobile"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#007A33] focus:outline-none focus:ring-1 focus:ring-[#007A33]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="bug-desc" className="text-xs font-medium text-gray-700">
                Steps to reproduce <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="bug-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="1. I clicked…&#10;2. Then…&#10;3. Expected X but got Y"
                className="resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#007A33] focus:outline-none focus:ring-1 focus:ring-[#007A33]"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg bg-[#007A33] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#005f28] disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Submit report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
