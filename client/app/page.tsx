import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "TransitFlow — GO Transit Explorer & Route Designer",
  description:
    "Plan better GO Transit networks with live GTFS intelligence. Explore routes, design new lines, simulate time-of-day service, and share ideas with the community.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "TransitFlow — GO Transit Explorer & Route Designer",
    description:
      "Plan better GO Transit networks with live GTFS intelligence. Explore routes, design new lines, simulate time-of-day service, and share ideas with the community.",
    url: SITE_URL,
    type: "website",
  },
};
import { ArrowRight, Check, Minus, X } from "lucide-react";
import {
  MAP,
  METRICS,
  FEATURES,
  STEPS,
  CAPABILITIES,
  USE_CASES,
  COMPARISON_FEATURES,
  COMPARISON_DATA,
  type CellVal,
} from "@/constants";
import MarketingShell from "@/components/marketing/MarketingShell";
import LandingHeader from "@/components/marketing/LandingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import {
  FadeUp,
  ScrollFade,
  StaggerGrid,
  StaggerItem,
  FloatBox,
  MetricStrip,
  MetricItem,
} from "@/components/marketing/LandingAnimations";

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

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "TransitFlow",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/landing-page.png`,
      },
      sameAs: ["https://github.com/faizm10/transit-flow"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "TransitFlow",
      description:
        "GO Transit route explorer, designer, and simulator built on live GTFS data.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "TransitFlow",
      url: SITE_URL,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
      description:
        "Browser-based GO Transit network explorer and route designer. View live GTFS data, draw custom routes, simulate time-of-day service, and share designs with the community.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function LandingPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingHeader />

      {/* ── 1. HERO ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--landing-border)] bg-white px-5 pb-0 pt-24 text-center lg:px-8 lg:pt-32">
        {/* Radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(0,122,51,0.07),transparent)]"
        />

        <div className="relative mx-auto max-w-3xl">
          {/* Badge */}
          <FadeUp delay={0}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--landing-border)] bg-white px-3.5 py-1.5 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--landing-accent)]" />
              <span className="text-xs font-medium text-[var(--landing-muted)]">
                Live GTFS data · GO Transit network
              </span>
            </div>
          </FadeUp>

          {/* Headline */}
          <FadeUp delay={0.08}>
            <h1 className="text-5xl font-extrabold tracking-[-0.03em] text-[var(--landing-fg)] sm:text-6xl lg:text-7xl lg:leading-[1.02]">
              Plan better transit networks{" "}
              <span className="text-[var(--landing-accent)]">
                with live GTFS intelligence.
              </span>
            </h1>
          </FadeUp>

          {/* Subheadline */}
          <FadeUp delay={0.16}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--landing-muted)] sm:text-xl">
              Explore GO Transit routes, compare schedules, sketch service changes,
              and simulate network flow — all in one browser-based workspace.
            </p>
          </FadeUp>

          {/* CTAs */}
          <FadeUp delay={0.24}>
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
          </FadeUp>
        </div>

        {/* Browser mockup — entrance + float */}
        <FloatBox className="relative mx-auto mt-16 max-w-5xl">
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
        </FloatBox>
      </section>

      {/* ── 2. METRIC STRIP ────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-gray-50">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <MetricStrip>
            <dl className="flex flex-wrap items-stretch divide-x divide-[var(--landing-border)]">
              {METRICS.map(({ value, label }) => (
                <MetricItem
                  key={label}
                  className="flex flex-1 flex-col items-center justify-center gap-0.5 px-6 py-6 min-w-[140px]"
                >
                  <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--landing-muted)]">
                    {label}
                  </dt>
                  <dd className="text-2xl font-bold tabular-nums text-[var(--landing-fg)]">
                    {value}
                  </dd>
                </MetricItem>
              ))}
            </dl>
          </MetricStrip>
        </div>
      </section>

      {/* ── 3. PRODUCT SHOWCASE ────────────────────────────────────────────── */}
      <section id="product" className="scroll-mt-14 border-b border-[var(--landing-border)] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <ScrollFade className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              Product
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              One workspace for the entire planning lifecycle.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--landing-muted)] sm:text-lg">
              Explore real GO Transit data, design new routes, analyze schedules, and simulate network flow — without switching tools.
            </p>
          </ScrollFade>

          <StaggerGrid className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <StaggerItem key={title}>
                <div className="group rounded-2xl border border-[var(--landing-border)] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--landing-border)] bg-gray-50">
                    <Icon className="h-5 w-5 text-[var(--landing-accent)]" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold text-[var(--landing-fg)]">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-gray-50 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <ScrollFade className="mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              How it works
            </p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              From first open to full simulation.
            </h2>
          </ScrollFade>

          <StaggerGrid className="grid gap-8 lg:grid-cols-4 lg:gap-0">
            {STEPS.map(({ n, title, body }, i) => (
              <StaggerItem key={n}>
                <div className="relative flex flex-col gap-4 lg:pr-10">
                  {/* Connector line (desktop only) */}
                  {i < STEPS.length - 1 && (
                    <div
                      aria-hidden
                      className="absolute left-10 top-5 hidden h-px bg-[var(--landing-border)] lg:block"
                      style={{ width: "calc(100% - 40px)" }}
                    />
                  )}
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--landing-border)] bg-white text-xs font-bold text-[var(--landing-muted)] shadow-sm">
                    {n}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--landing-fg)]">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ── 5. CAPABILITIES ────────────────────────────────────────────────── */}
      <section id="capabilities" className="scroll-mt-14 border-b border-[var(--landing-border)] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <ScrollFade className="mb-16 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
          </ScrollFade>

          <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <StaggerItem key={title}>
                <div className="h-full rounded-2xl border border-[var(--landing-border)] p-6 transition-all hover:border-gray-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A33]/8 text-[var(--landing-accent)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold text-[var(--landing-fg)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ── 6. USE CASES ───────────────────────────────────────────────────── */}
      <section id="use-cases" className="scroll-mt-14 border-b border-[var(--landing-border)] bg-gray-50 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <ScrollFade className="mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              Use cases
            </p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              Built for people who think in networks.
            </h2>
          </ScrollFade>

          <StaggerGrid className="grid gap-4 sm:grid-cols-2">
            {USE_CASES.map(({ icon: Icon, tag, title, body }) => (
              <StaggerItem key={tag}>
                <div className="flex h-full flex-col gap-5 rounded-2xl border border-[var(--landing-border)] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_8px_32px_rgba(0,0,0,0.07)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#007A33]/8 text-[var(--landing-accent)]">
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
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
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ── 7. COMPARISON ──────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <ScrollFade className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
              Why TransitFlow
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-[-0.02em] text-[var(--landing-fg)] sm:text-5xl">
              Built for exploration, not static maps.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--landing-muted)]">
              Most transit tooling is built for consumption, not planning. TransitFlow is the workspace the others don&apos;t offer.
            </p>
          </ScrollFade>

          <ScrollFade delay={0.1}>
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
                          i === 0 ? "text-[var(--landing-accent)]" : "text-[var(--landing-muted)]"
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
                        <td
                          key={tool}
                          className={`px-6 py-4 text-center ${ti === 0 ? "bg-[#007A33]/[0.03]" : ""}`}
                        >
                          <Cell val={vals[fi]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollFade>
        </div>
      </section>

      {/* ── 8. FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="bg-[var(--landing-fg)] px-5 py-24 lg:py-32">
        <ScrollFade className="mx-auto max-w-3xl text-center">
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
        </ScrollFade>
      </section>

      <MarketingFooter />
    </MarketingShell>
  );
}
