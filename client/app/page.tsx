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
import MarketingTrustMarquee from "@/components/marketing/MarketingTrustMarquee";
import MarketingFaq from "@/components/marketing/MarketingFaq";

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

const AUDIENCES = ["Riders", "Planners", "Students", "Researchers"] as const;

export default function LandingPage() {
  return (
    <MarketingShell>
      <MarketingHeader />

      <HeroSection />

      <MarketingTrustMarquee />

      <section className="border-b border-[var(--landing-border)] bg-[var(--landing-bg)] py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 text-center lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            Coverage
          </p>
          <p className="mt-4 text-sm font-medium text-[var(--landing-muted)]">Across the network</p>
          <p className="mx-auto mt-2 max-w-4xl text-4xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-5xl sm:leading-[1.05]">
            <span className="text-[var(--landing-muted)]">Over</span>{" "}
            <span className="tabular-nums">45</span>{" "}
            <span className="text-[var(--landing-muted)]">routes ·</span>{" "}
            <span className="tabular-nums">8</span>{" "}
            <span className="text-[var(--landing-muted)]">rail corridors</span>
          </p>
        </div>
      </section>

      <section className="marketing-dot-bg border-b border-[var(--landing-border)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            Product
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl sm:leading-tight">
            Four modes. One map.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--landing-muted)]">
            Same live network — switch modes without leaving the page.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STATS.map(({ n, label, sub }) => (
              <div
                key={label}
                className="rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-5 py-5 shadow-[0_14px_40px_-28px_color-mix(in_oklab,var(--landing-fg)_18%,transparent)]"
              >
                <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--landing-fg)]">{n}</p>
                <p className="mt-1 text-sm font-medium text-[var(--landing-fg)]">{label}</p>
                <p className="mt-0.5 text-xs text-[var(--landing-muted)]">{sub}</p>
              </div>
            ))}
          </div>

          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {FEATURES.map(({ href, tag, title, body, icon: Icon }) => (
              <li key={tag}>
                <Link
                  href={href}
                  className="group flex h-full flex-col gap-4 rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-6 shadow-[0_14px_40px_-28px_color-mix(in_oklab,var(--landing-fg)_14%,transparent)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--landing-fg)_12%,var(--landing-border))] hover:shadow-[0_20px_48px_-28px_color-mix(in_oklab,var(--landing-fg)_22%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--landing-border)] bg-[var(--landing-band)] text-[var(--landing-fg)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--landing-muted)]">
                      {tag}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[var(--landing-fg)]">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[var(--landing-accent)]">
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

      <section className="border-b border-[var(--landing-border)] bg-[var(--landing-band)] py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            Built for
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {AUDIENCES.map((label) => (
              <span
                key={label}
                className="rounded-full border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-4 py-2 text-sm font-medium text-[var(--landing-fg)] shadow-[0_1px_0_color-mix(in_oklab,var(--landing-fg)_5%,transparent)]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

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

      <section
        id="how-it-works"
        className="scroll-mt-24 border-b border-[var(--landing-border)] bg-[var(--landing-bg)] py-16 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
            How it works
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
            From first open to iteration
          </h2>

          <ol className="mt-12 grid gap-8 lg:grid-cols-3 lg:gap-10">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="flex flex-col gap-4 lg:pt-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--landing-border)] bg-[var(--landing-elevated)] text-xs font-bold text-[var(--landing-muted)] shadow-[0_1px_0_color-mix(in_oklab,var(--landing-fg)_6%,transparent)]">
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

      <MarketingFaq />

      <section className="border-b border-white/10 bg-[var(--landing-fg)] py-16 text-[var(--landing-bg)] sm:py-24">
        <div className="mx-auto max-w-2xl px-5 text-center lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Get started in minutes.</h2>
          <p className="mt-4 text-base leading-relaxed text-[color-mix(in_oklab,var(--landing-bg)_72%,white)]">
            Open the map — every GO Transit route is there. No account needed.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href={MAP}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--landing-accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#006b2d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-fg)] sm:w-auto"
            >
              <Map className="h-5 w-5" aria-hidden />
              Open TransitFlow
            </Link>
            <Link
              href="/about"
              className="inline-flex w-full items-center justify-center rounded-lg border border-white/25 bg-transparent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-fg)] sm:w-auto"
            >
              Read the overview
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </MarketingShell>
  );
}
