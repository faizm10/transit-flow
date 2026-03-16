"use client";

import { CrossCircledIcon } from "@radix-ui/react-icons";
import { CommunityReportForm } from "@/components/CommunityReportForm";
import type { CommunityReportType } from "@/lib/community";

type BugReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialType?: CommunityReportType;
  source: string;
  context?: Record<string, unknown>;
};

export function BugReportModal({
  isOpen,
  onClose,
  initialType = "bug",
  source,
  context,
}: BugReportModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl rounded-[2rem] border border-white/40 bg-white/96 shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">TransitFlow community</p>
            <p className="text-xs text-slate-500">
              Submit a public GitHub-backed bug report or feedback item.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close community report modal"
          >
            <CrossCircledIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <CommunityReportForm
            initialType={initialType}
            source={source}
            context={context}
            compact
            onSubmitted={() => {
              window.setTimeout(() => onClose(), 1200);
            }}
          />
        </div>
      </div>
    </div>
  );
}
