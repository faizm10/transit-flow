"use client";

import Link from "next/link";
import { CommunityReportForm } from "@/components/CommunityReportForm";
import { getCommunityIssuesUrl, type CommunityReportType } from "@/lib/community";

export function CommunityPageClient({ initialType }: { initialType: CommunityReportType }) {
  const issuesUrl = getCommunityIssuesUrl();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f8f3] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:92px_92px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(134,239,172,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(191,219,254,0.18),transparent_28%),linear-gradient(180deg,rgba(245,248,243,0.94),rgba(245,248,243,0.98))]" />
      </div>

      <div className="relative mx-auto max-w-5xl space-y-8">
        <div className="space-y-4">
          <div className="inline-flex rounded-full border border-[#cfe0cf] bg-white/82 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0b6f3c]">
            Community desk
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl">
            Report bugs and send product feedback.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-600">
            TransitFlow uses GitHub as the public system of record for community submissions.
            Use the form below for bugs or product feedback, or browse existing issues if you
            want to avoid duplicates.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Plain text only</span>
            <span>Public beta submissions</span>
            <span>GitHub-backed triage</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <CommunityReportForm initialType={initialType} source="community-page" />

          <div className="space-y-4 rounded-[2rem] border border-[#d8e2d4] bg-white/84 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-950">Before you submit</h2>
              <p className="text-sm leading-6 text-slate-600">
                Check existing GitHub issues first. Bugs and feedback submitted here may be converted
                into public issues with triage labels like <code>bug</code> or <code>feedback</code>.
              </p>
            </div>

            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>Include enough detail to reproduce bugs.</li>
              <li>Do not include private or sensitive data.</li>
              <li>Feature ideas should include the use case and expected benefit.</li>
            </ul>

            <div className="rounded-2xl border border-[#d8e2d4] bg-[#f8fbf7] p-4 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">Triage expectations</p>
              <p className="mt-1">
                Community-submitted issues are reviewed, labeled, and deduplicated in GitHub.
                Not every feedback item becomes a roadmap commitment.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={issuesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-full bg-[#0b6f3c] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#095c32]"
              >
                Browse issues
              </Link>
              <Link href="/" className="inline-flex rounded-full border border-[#d8e2d4] px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">
                Back home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
