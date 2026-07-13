import type { Metadata } from "next";
import Link from "next/link";
import { Train, ArrowLeft } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import LandingHeader from "@/components/marketing/LandingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "Changelog — TransitFlow",
  description: "New features, improvements, and fixes in TransitFlow.",
};

interface Release {
  version: string;
  date: string;
  badge?: "New" | "Beta";
  items: { type: "feature" | "improvement" | "fix"; text: string }[];
}

const RELEASES: Release[] = [
  {
    version: "Multi-City GTFS & Accounts",
    date: "June 2025",
    badge: "New",
    items: [
      { type: "feature", text: "Upload any city's GTFS ZIP file and explore it on the same map alongside GO Transit." },
      { type: "feature", text: "Sign in with Google or GitHub to save your GTFS feeds and access them from any device." },
      { type: "feature", text: "Feed mode switcher — view GO Transit only, your city only, or both layers at once." },
      { type: "feature", text: "Route colors pulled directly from GTFS route_color field for accurate agency branding." },
      { type: "feature", text: "Background GTFS processing — upload completes instantly while the feed processes in the cloud." },
      { type: "improvement", text: "All simulation and schedule APIs now work with any GTFS feed, not just GO Transit." },
    ],
  },
  {
    version: "Route Scoring & Comparison",
    date: "May 2025",
    badge: "New",
    items: [
      { type: "feature", text: "Route Scorecard: letter grade + four dimension bars (frequency, coverage, connectivity, efficiency)." },
      { type: "feature", text: "Comparison Panel: side-by-side custom route vs. nearest GO Transit variant." },
      { type: "feature", text: "Heatmap overlay showing GO Transit stop activity by trip frequency." },
      { type: "feature", text: "Coverage zone visualization — see service gaps at a glance." },
    ],
  },
  {
    version: "AI Schedule Optimizer",
    date: "April 2025",
    items: [
      { type: "feature", text: "AI-powered schedule suggestions using Claude — optimizes departure times based on demand patterns." },
      { type: "feature", text: "Drawable line mode: sketch a route on the map and snap it to real GO Transit stops." },
      { type: "improvement", text: "Schedule inspector shows per-stop times for any trip variant." },
    ],
  },
  {
    version: "Simulation Engine",
    date: "March 2025",
    items: [
      { type: "feature", text: "Time-of-day simulation — animate trains and buses moving along their real GTFS schedules." },
      { type: "feature", text: "Day-of-week service selection (weekday, Saturday, Sunday)." },
      { type: "improvement", text: "Simulation data pre-computed from GTFS for fast playback at any speed." },
    ],
  },
  {
    version: "Community & Sharing",
    date: "February 2025",
    items: [
      { type: "feature", text: "Community page to browse and discover route designs shared by other users." },
      { type: "feature", text: "Share custom routes with a public link." },
      { type: "feature", text: "GitHub and Google sign-in for account management." },
    ],
  },
];

const TYPE_STYLES = {
  feature:     "bg-[var(--landing-accent)]/10 text-[var(--landing-accent)]",
  improvement: "bg-blue-50 text-blue-700",
  fix:         "bg-amber-50 text-amber-700",
} as const;

const TYPE_LABELS = {
  feature:     "Feature",
  improvement: "Improvement",
  fix:         "Fix",
} as const;

export default function ChangelogPage() {
  return (
    <MarketingShell>
      <LandingHeader />

      <main className="mx-auto max-w-2xl px-5 py-16 lg:px-8 lg:py-24">
        {/* Back link */}
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-1.5 text-sm text-[var(--landing-muted)] hover:text-[var(--landing-fg)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>

        <div className="mb-12">
          <div className="mb-3 inline-flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--landing-accent)] text-white shadow-sm">
              <Train className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-[var(--landing-accent)]">TransitFlow</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--landing-fg)] lg:text-4xl">
            Changelog
          </h1>
          <p className="mt-2 text-[var(--landing-muted)]">
            New features, improvements, and fixes — most recent first.
          </p>
        </div>

        <div className="space-y-14">
          {RELEASES.map((release) => (
            <article key={release.version} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-px top-2 hidden h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--landing-accent)] lg:block" />

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-[var(--landing-fg)]">
                  {release.version}
                </h2>
                {release.badge && (
                  <span className="rounded-full bg-[var(--landing-accent)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--landing-accent)]">
                    {release.badge}
                  </span>
                )}
                <time className="ml-auto text-sm text-[var(--landing-muted)]">
                  {release.date}
                </time>
              </div>

              <ul className="space-y-2.5">
                {release.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
                      {TYPE_LABELS[item.type]}
                    </span>
                    <span className="text-sm text-[var(--landing-muted)] leading-relaxed">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-b border-[var(--landing-border)]" />
            </article>
          ))}
        </div>

        <p className="mt-12 text-sm text-[var(--landing-muted)]">
          Have a feature request?{" "}
          <a
            href="https://github.com/faizm10/transit-flow/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[var(--landing-accent)] transition-colors"
          >
            Open an issue on GitHub
          </a>
          .
        </p>
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
