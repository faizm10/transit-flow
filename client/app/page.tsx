"use client";

import Link from "next/link";
import {
  Map,
  PlayCircle,
  ArrowRight,
  CalendarClock,
  Route,
  Search,
  ChevronRight,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const MAP = "/map";

const FEATURES = [
  {
    href: MAP,
    tag: "Explore",
    title: "Browse the network",
    body: "All 45 GO Transit lines on a live map. Routes, stops, and GTFS frequency data.",
    icon: Search,
  },
  {
    href: MAP,
    tag: "Design",
    title: "Sketch a route",
    body: "Draw corridors, place stops, and set headways on the canvas.",
    icon: Route,
  },
  {
    href: MAP,
    tag: "Simulate",
    title: "Watch it move",
    body: "Animate trains and buses and scrub through the day.",
    icon: PlayCircle,
  },
  {
    href: MAP,
    tag: "Schedules",
    title: "Inspect timetables",
    body: "Compare headways across any GO line.",
    icon: CalendarClock,
  },
] as const;

const STATS = [
  { n: "45", label: "GO Transit routes", sub: "Bus + rail" },
  { n: "8", label: "Rail lines", sub: "Lakeshore, Kitchener, Barrie, and more" },
  { n: "250+", label: "Route variants", sub: "Directions and branches" },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Open the map",
    body: "All 45 GO Transit lines load immediately. No account or setup.",
  },
  {
    n: "02",
    title: "Pick your mode",
    body: "Explore routes, sketch in Design, check timetables, or use Simulate.",
  },
  {
    n: "03",
    title: "Iterate",
    body: "Adjust stops, tweak schedules, replay the simulation. Updates stay instant.",
  },
] as const;

export default function LandingPage() {
  return (
    <MarketingShell>
      <MarketingHeader />

      <HeroSection />

      <section className="border-b border-[var(--landing-border)] bg-[var(--landing-band)] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            Platform
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
            Four modes. One map.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--landing-muted)]">
            Same live network — switch modes without leaving the page.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {STATS.map(({ n, label, sub }) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-5 py-4"
              >
                <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--landing-fg)]">{n}</p>
                <p className="mt-1 text-sm font-medium text-[var(--landing-fg)]">{label}</p>
                <p className="mt-0.5 text-xs text-[var(--landing-muted)]">{sub}</p>
              </div>
            ))}
          </div>

          <ul className="mt-6 space-y-3">
            {FEATURES.map(({ href, tag, title, body, icon: Icon }) => (
              <li key={tag}>
                <Link
                  href={href}
                  className="group flex flex-col gap-4 rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.04] sm:flex-row sm:items-center sm:gap-6 sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--landing-border)] bg-white/[0.06] text-[var(--landing-fg)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--landing-muted)]">
                      {tag}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[var(--landing-fg)]">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--landing-accent)]">
                    Open
                    <ChevronRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Light band — mixed theme contrast */}
      <section className="border-b border-[var(--landing-mixed-border)] bg-[var(--landing-mixed-bg)] py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            Why TransitFlow
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--landing-mixed-fg)] sm:text-4xl sm:leading-tight">
            Transit planning is hard enough. Visualizing it shouldn&apos;t be.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--landing-mixed-muted)] sm:text-lg">
            The full GO Transit network — live data, a drawing canvas, timetable views, and a simulation
            engine — in one map.
          </p>
          <Link
            href={MAP}
            className="mt-8 inline-flex items-center gap-2 rounded-lg border border-[var(--landing-mixed-border)] bg-[var(--landing-mixed-fg)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-mixed-bg)]"
          >
            Try it now
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="border-b border-[var(--landing-border)] bg-[var(--landing-bg)] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            How it works
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
            Three steps
          </h2>

          <ol className="mt-10 max-w-2xl space-y-8">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--landing-border)] bg-[var(--landing-elevated)] text-xs font-bold text-[var(--landing-muted)]">
                  {n}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--landing-fg)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[var(--landing-band)] py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-5 text-center lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
            Ready to explore the network?
          </h2>
          <p className="mt-4 text-[var(--landing-muted)]">
            Open the map — every GO Transit route is there. No account needed.
          </p>
          <Link
            href={MAP}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[var(--landing-accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#006b2d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-band)]"
          >
            <Map className="h-5 w-5" aria-hidden />
            Open TransitFlow
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </MarketingShell>
  );
}
