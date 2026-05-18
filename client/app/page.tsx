import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Minus,
  X,
  Route,
  PenLine,
  BarChart2,
  Bell,
  PlayCircle,
  Layers,
  GraduationCap,
  Users,
  Code2,
  Building2,
} from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import LandingHeader from "@/components/marketing/LandingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const MAP = "/map";

// ─── Data ────────────────────────────────────────────────────────────────────

const METRICS = [
  { value: "45+",        label: "GO Transit routes"          },
  { value: "Live",       label: "GTFS-based routing"         },
  { value: "4",          label: "Planning modes"             },
  { value: "250+",       label: "Route variants"             },
  { value: "Browser",    label: "No install required"        },
] as const;

const FEATURES = [
  {
    icon: Route,
    title: "Route Explorer",
    body: "All 45 GO lines on a live map. Real stop sequences, headways, and GTFS trip data.",
  },
  {
    icon: BarChart2,
    title: "Schedule Comparison",
    body: "Inspect timetables, compare headways across lines, and identify service gaps.",
  },
  {
    icon: Bell,
    title: "Service Updates",
    body: "Live alerts from GO Transit — delays, cancellations, and notices, filterable by line.",
  },
  {
    icon: PlayCircle,
    title: "Simulation HUD",
    body: "Animate the entire network or a single custom route. Scrub through any hour of the day.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Connect GTFS data",
    body: "The full GO Transit network loads instantly — stops, trips, shapes, and frequencies — derived from the live GTFS feed.",
  },
  {
    n: "02",
    title: "Explore routes visually",
    body: "Browse any of the 45+ routes on an interactive map. Click a line to inspect its stops, trip count, and corridor.",
  },
  {
    n: "03",
    title: "Compare service patterns",
    body: "Switch to Schedules mode to compare headways across lines or examine departure times at any stop.",
  },
  {
    n: "04",
    title: "Simulate network changes",
    body: "Draw a new route, set its schedule, then watch it run alongside the live GO network in the simulation engine.",
  },
] as const;

const CAPABILITIES = [
  {
    icon: Route,
    title: "GTFS-powered route intelligence",
    body: "Derived GeoJSON and stop data from the official GO Transit GTFS feed. Always accurate, always structured.",
  },
  {
    icon: PenLine,
    title: "Interactive route sketching",
    body: "Draw corridors on the map, snap to the rail network, place stops, and wire up a full schedule in minutes.",
  },
  {
    icon: BarChart2,
    title: "Schedule and departure analysis",
    body: "Inspect any line's timetable, compare peak vs. off-peak headways, and surface gaps in coverage.",
  },
  {
    icon: Bell,
    title: "Service update visualization",
    body: "Live GO Transit alerts delivered directly into the workspace — filterable by line, categorized by severity.",
  },
  {
    icon: PlayCircle,
    title: "Simulation-ready transit data",
    body: "The simulation engine animates vehicles across the real network — or any custom route you design.",
  },
  {
    icon: Layers,
    title: "Planner-friendly map workspace",
    body: "One browser tab. Four modes. No GIS software, no install, no account required to start exploring.",
  },
] as const;

const USE_CASES = [
  {
    icon: Building2,
    tag: "For transit planners",
    title: "Evaluate service changes before they ship.",
    body: "Sketch a new route, compare it against the existing network, run a simulation, and share the result — all in one workspace.",
  },
  {
    icon: GraduationCap,
    tag: "For students & researchers",
    title: "Study real networks with real data.",
    body: "The full GO Transit GTFS feed, structured and queryable. Ideal for urban planning coursework, network analysis, and thesis research.",
  },
  {
    icon: Code2,
    tag: "For civic hackers",
    title: "Build on live GTFS without the overhead.",
    body: "Pre-processed GeoJSON, derived stop data, and a simulation engine — open source and ready to extend.",
  },
  {
    icon: Users,
    tag: "For agencies exploring changes",
    title: "Communicate proposals visually.",
    body: "Generate shareable map views of proposed service changes. Show the community what a new route looks like before a single dollar is spent.",
  },
] as const;

const COMPARISON_FEATURES = [
  "Live network data",
  "Route design tools",
  "Schedule analysis",
  "Simulation engine",
  "Service update alerts",
  "Browser-based",
  "Free to use",
];

type CellVal = "yes" | "no" | "partial";

const COMPARISON_DATA: Record<string, CellVal[]> = {
  "TransitFlow":            ["yes", "yes", "yes", "yes", "yes", "yes", "yes"],
  "Static PDF maps":        ["no",  "no",  "no",  "no",  "no",  "partial", "yes"],
  "Spreadsheet planning":   ["no",  "partial", "partial", "no", "no", "yes", "yes"],
  "Disconnected GIS tools": ["partial", "partial", "no", "no", "no", "no", "no"],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Cell({ val }: { val: CellVal }) {
  if (val === "yes")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#007A33]/10">
        <Check className="h-3.5 w-3.5 text-[#007A33]" />
      </span>
    );
  if (val === "partial")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
        <Minus className="h-3.5 w-3.5 text-gray-400" />
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
      <X className="h-3.5 w-3.5 text-gray-300" />
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <MarketingShell>
      <LandingHeader />

      {/* ── 1. HERO ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--landing-border)] bg-white px-5 pb-0 pt-24 text-center lg:px-8 lg:pt-32">
        {/* Subtle radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(0,122,51,0.07),transparent)]"
        />

        <div className="relative mx-auto max-w-3xl">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--landing-border)] bg-white px-3.5 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--landing-accent)]" />
            <span className="text-xs font-medium text-[var(--landing-muted)]">
              Live GTFS data · GO Transit network
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-extrabold tracking-[-0.03em] text-[var(--landing-fg)] sm:text-6xl lg:text-7xl lg:leading-[1.02]">
            Plan better transit networks{" "}
            <span className="text-[var(--landing-accent)]">
              with live GTFS intelligence.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--landing-muted)] sm:text-xl">
            Explore GO Transit routes, compare schedules, sketch service changes,
            and simulate network flow — all in one browser-based workspace.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={MAP}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--landing-accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#006b2d] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2"
            >
              Open TransitFlow
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/community"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--landing-border)] bg-white px-6 py-3.5 text-sm font-semibold text-[var(--landing-fg)] transition-all hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2"
            >
              View community routes
            </Link>
          </div>
        </div>

        {/* Browser mockup */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="overflow-hidden rounded-t-2xl border border-b-0 border-gray-200 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]">
            {/* Chrome bar */}
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <div className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="mx-auto max-w-xs flex-1 rounded-md border border-gray-200 bg-white px-3 py-1 text-center text-xs text-gray-400">
                transit-flow-two.vercel.app/map
              </div>
              <div className="w-16" aria-hidden />
            </div>
            {/* Screenshot */}
            <div className="bg-[#0a1628]">
              <Image
                src="/landing-page.png"
                alt="TransitFlow map showing GO Transit routes"
                width={1280}
                height={720}
                className="w-full"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. METRIC STRIP ────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-gray-50">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <dl className="flex flex-wrap items-stretch divide-x divide-[var(--landing-border)]">
            {METRICS.map(({ value, label }) => (
              <div key={label} className="flex flex-1 flex-col items-center justify-center gap-0.5 px-6 py-6 min-w-[140px]">
                <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--landing-muted)]">
                  {label}
                </dt>
                <dd className="text-2xl font-bold tabular-nums text-[var(--landing-fg)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 3. PRODUCT SHOWCASE ────────────────────────────────────────────── */}
      <section id="product" className="scroll-mt-14 border-b border-[var(--landing-border)] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              Product
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              One workspace for the entire planning lifecycle.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--landing-muted)] sm:text-lg">
              Explore real GO Transit data, design new routes, analyze schedules, and simulate network flow — without switching tools.
            </p>
          </div>

          {/* Feature cards */}
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-2xl border border-[var(--landing-border)] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--landing-border)] bg-gray-50">
                  <Icon className="h-5 w-5 text-[var(--landing-accent)]" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold text-[var(--landing-fg)]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-gray-50 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              How it works
            </p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              From first open to full simulation.
            </h2>
          </div>

          <ol className="grid gap-0 lg:grid-cols-4">
            {STEPS.map(({ n, title, body }, i) => (
              <li key={n} className="relative flex flex-col gap-4 py-8 lg:py-0 lg:pr-10">
                {/* Connector line (desktop) */}
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute right-0 top-5 hidden h-px w-full translate-x-5 bg-[var(--landing-border)] lg:block"
                    style={{ width: "calc(100% - 44px)" }}
                  />
                )}
                {/* Number */}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--landing-border)] bg-white text-xs font-bold text-[var(--landing-muted)] shadow-sm">
                  {n}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[var(--landing-fg)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 5. CAPABILITIES ────────────────────────────────────────────────── */}
      <section id="capabilities" className="scroll-mt-14 border-b border-[var(--landing-border)] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-16 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
                Core capabilities
              </p>
              <h2 className="mt-3 max-w-lg text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
                Everything a planner needs. Nothing they don&apos;t.
              </h2>
            </div>
            <Link
              href={MAP}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--landing-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#006b2d]"
            >
              Explore the workspace
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--landing-border)] p-6 transition-all hover:border-gray-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--landing-accent)]/8 text-[var(--landing-accent)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold text-[var(--landing-fg)]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. USE CASES ───────────────────────────────────────────────────── */}
      <section id="use-cases" className="scroll-mt-14 border-b border-[var(--landing-border)] bg-gray-50 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              Use cases
            </p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              Built for people who think in networks.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {USE_CASES.map(({ icon: Icon, tag, title, body }) => (
              <div
                key={tag}
                className="flex flex-col gap-5 rounded-2xl border border-[var(--landing-border)] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_8px_32px_rgba(0,0,0,0.07)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--landing-accent)]/8 text-[var(--landing-accent)]">
                    <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
                    {tag}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold leading-snug text-[var(--landing-fg)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. COMPARISON ──────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              Why TransitFlow
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              Built for exploration, not static maps.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--landing-muted)]">
              Most transit tooling is built for consumption, not planning. TransitFlow is the workspace the others don&apos;t offer.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--landing-border)] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--landing-border)] bg-gray-50">
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-widest text-[var(--landing-muted)]">
                    Feature
                  </th>
                  {Object.keys(COMPARISON_DATA).map((tool, i) => (
                    <th
                      key={tool}
                      className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-widest ${
                        i === 0
                          ? "text-[var(--landing-accent)]"
                          : "text-[var(--landing-muted)]"
                      }`}
                    >
                      {tool}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--landing-border)]">
                {COMPARISON_FEATURES.map((feature, fi) => (
                  <tr key={feature} className="bg-white transition-colors hover:bg-gray-50/60">
                    <td className="px-6 py-4 font-medium text-[var(--landing-fg)]">{feature}</td>
                    {Object.entries(COMPARISON_DATA).map(([tool, vals], ti) => (
                      <td key={tool} className={`px-6 py-4 text-center ${ti === 0 ? "bg-[var(--landing-accent)]/[0.03]" : ""}`}>
                        <Cell val={vals[fi]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="bg-[var(--landing-fg)] px-5 py-24 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
            Start exploring the future of transit planning.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/60">
            The full GO Transit network — live GTFS, a drawing canvas, schedule analysis, and a simulation engine — free in your browser.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={MAP}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--landing-accent)] px-7 py-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#006b2d] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-fg)]"
            >
              Open TransitFlow
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="https://github.com/faizm10/transit-flow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-7 py-4 text-sm font-semibold text-white transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-fg)]"
            >
              View on GitHub
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </MarketingShell>
  );
}
