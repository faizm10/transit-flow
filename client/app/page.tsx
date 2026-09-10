import type { Metadata } from "next";
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

import { Check, Minus, X } from "lucide-react";
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
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { Eyebrow, SpecMeta, CornerButton } from "@/components/marketing/spec";
import { FadeUp } from "@/components/marketing/LandingAnimations";

// ─── Sub-components ───────────────────────────────────────────────────────────

function Cell({ val }: { val: CellVal }) {
  if (val === "yes")
    return (
      <Check
        className="mx-auto h-4 w-4 text-[var(--landing-accent)]"
        aria-label="yes"
      />
    );
  if (val === "partial")
    return (
      <Minus
        className="mx-auto h-4 w-4 text-[var(--landing-faint)]"
        aria-label="partial"
      />
    );
  return (
    <X
      className="mx-auto h-4 w-4 text-[var(--landing-border-2)]"
      aria-label="no"
    />
  );
}

const sectionHeading =
  "font-[family-name:var(--font-hanken)] text-[2rem] font-normal leading-[1.1] tracking-[-0.025em] text-[var(--landing-ink)] sm:text-[2.5rem]";

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
      <MarketingHeader />

      {/* ── 1. HERO ────────────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] px-5 pb-16 pt-20 lg:px-8 lg:pb-20 lg:pt-28">
        <div className="mx-auto max-w-3xl">
          <FadeUp>
            <Eyebrow>Live GTFS · GO Transit</Eyebrow>
          </FadeUp>

          <FadeUp delay={0.08}>
            <h1 className="mt-5 font-[family-name:var(--font-hanken)] text-[2.75rem] font-normal leading-[1.03] tracking-[-0.03em] text-[var(--landing-ink)] sm:text-[3.75rem]">
              Design the GO network{" "}
              <span className="text-[var(--landing-accent)]">
                you wish you had.
              </span>
            </h1>
          </FadeUp>

          <FadeUp delay={0.16}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--landing-muted)]">
              Explore GO Transit routes, compare schedules, sketch service
              changes, and simulate network flow, all in one browser-based
              workspace.
            </p>
          </FadeUp>

          <FadeUp delay={0.24}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <CornerButton href={MAP} solid>
                Open the map →
              </CornerButton>
              <CornerButton href="/blog">Read the blog</CornerButton>
            </div>
          </FadeUp>
        </div>

        {/* Screenshot in a hairline frame */}
        <FadeUp delay={0.34} className="mx-auto mt-16 max-w-5xl">
          <figure className="border border-[var(--landing-border)]">
            <figcaption className="flex items-center gap-3 border-b border-[var(--landing-border)] bg-[var(--landing-band)] px-4 py-2 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--landing-faint)]">
              <span className="text-[var(--landing-accent)]">/</span>{" "}
              transit-flow-two.vercel.app/map
            </figcaption>
            <Image
              src="/landing-page.png"
              alt="TransitFlow map showing GO Transit routes"
              width={1280}
              height={720}
              className="w-full"
              priority
            />
          </figure>
        </FadeUp>
      </section>

      {/* ── 2. METRIC STRIP ────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-[var(--landing-band)]">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--landing-border)] sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
            {METRICS.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col gap-1 px-5 py-6"
              >
                <dt className="font-[family-name:var(--landing-mono)] text-[0.625rem] uppercase tracking-[0.1em] text-[var(--landing-faint)]">
                  {label}
                </dt>
                <dd className="font-[family-name:var(--font-hanken)] text-2xl font-normal tabular-nums text-[var(--landing-ink)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 3. PRODUCT ─────────────────────────────────────────────────────── */}
      <section
        id="product"
        className="scroll-mt-14 border-b border-[var(--landing-border)] py-20 lg:py-28"
      >
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow>01 / Product</Eyebrow>
            <h2 className={`mt-4 ${sectionHeading}`}>
              One workspace for the entire planning lifecycle.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--landing-muted)]">
              Explore real GO Transit data, design new routes, analyze
              schedules, and simulate network flow, without switching tools.
            </p>
          </div>

          <div className="mt-14 grid border-t border-l border-[var(--landing-border)] sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="border-b border-r border-[var(--landing-border)] p-6"
              >
                <Icon
                  className="h-5 w-5 text-[var(--landing-accent)]"
                  aria-hidden
                />
                <h3 className="mt-4 font-[family-name:var(--font-hanken)] text-base font-medium text-[var(--landing-ink)]">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--landing-muted)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] bg-[var(--landing-band)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-14 max-w-xl">
            <Eyebrow>02 / How it works</Eyebrow>
            <h2 className={`mt-4 ${sectionHeading}`}>
              From first open to full simulation.
            </h2>
          </div>

          <div className="grid gap-px border border-[var(--landing-border)] bg-[var(--landing-border)] lg:grid-cols-4">
            {STEPS.map(({ n, title, body }) => (
              <div
                key={n}
                className="flex flex-col gap-3 bg-[var(--landing-bg)] p-6"
              >
                <span className="font-[family-name:var(--landing-mono)] text-[0.6875rem] font-medium tracking-[0.1em] text-[var(--landing-accent)]">
                  {n}
                </span>
                <h3 className="font-[family-name:var(--font-hanken)] text-base font-medium text-[var(--landing-ink)]">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--landing-muted)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. CAPABILITIES ────────────────────────────────────────────────── */}
      <section
        id="capabilities"
        className="scroll-mt-14 border-b border-[var(--landing-border)] py-20 lg:py-28"
      >
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-14 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-lg">
              <Eyebrow>03 / Core capabilities</Eyebrow>
              <h2 className={`mt-4 ${sectionHeading}`}>
                Everything a planner needs. Nothing they don&apos;t.
              </h2>
            </div>
            <CornerButton href={MAP}>Explore the workspace →</CornerButton>
          </div>

          <div className="grid border-t border-l border-[var(--landing-border)] sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="border-b border-r border-[var(--landing-border)] p-6"
              >
                <Icon
                  className="h-5 w-5 text-[var(--landing-accent)]"
                  aria-hidden
                />
                <h3 className="mt-4 font-[family-name:var(--font-hanken)] text-base font-medium text-[var(--landing-ink)]">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--landing-muted)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. USE CASES ───────────────────────────────────────────────────── */}
      <section
        id="use-cases"
        className="scroll-mt-14 border-b border-[var(--landing-border)] bg-[var(--landing-band)] py-20 lg:py-28"
      >
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-14 max-w-xl">
            <Eyebrow>04 / Use cases</Eyebrow>
            <h2 className={`mt-4 ${sectionHeading}`}>
              Built for people who think in networks.
            </h2>
          </div>

          <div className="grid gap-px border border-[var(--landing-border)] bg-[var(--landing-border)] sm:grid-cols-2">
            {USE_CASES.map(({ icon: Icon, tag, title, body }) => (
              <div
                key={tag}
                className="flex flex-col gap-4 bg-[var(--landing-bg)] p-7"
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className="h-[18px] w-[18px] text-[var(--landing-accent)]"
                    aria-hidden
                  />
                  <span className="font-[family-name:var(--landing-mono)] text-[0.625rem] uppercase tracking-[0.1em] text-[var(--landing-faint)]">
                    {tag}
                  </span>
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-hanken)] text-lg font-medium leading-snug text-[var(--landing-ink)]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. COMPARISON ──────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--landing-border)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mb-10 max-w-xl">
            <Eyebrow>05 / Why TransitFlow</Eyebrow>
            <h2 className={`mt-4 ${sectionHeading}`}>
              Built for exploration, not static maps.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--landing-muted)]">
              Most transit tooling is built for consumption, not planning.
              TransitFlow is the workspace the others don&apos;t offer.
            </p>
          </div>

          <div>
            <div className="overflow-x-auto border border-[var(--landing-border)]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--landing-border)] bg-[var(--landing-band)]">
                    <th className="px-5 py-3.5 font-[family-name:var(--landing-mono)] text-[0.625rem] font-medium uppercase tracking-[0.1em] text-[var(--landing-faint)]">
                      Feature
                    </th>
                    {Object.keys(COMPARISON_DATA).map((tool, i) => (
                      <th
                        key={tool}
                        className={`px-5 py-3.5 text-center font-[family-name:var(--landing-mono)] text-[0.625rem] font-medium uppercase tracking-[0.1em] ${
                          i === 0
                            ? "text-[var(--landing-accent)]"
                            : "text-[var(--landing-faint)]"
                        }`}
                      >
                        {tool}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--landing-border)]">
                  {COMPARISON_FEATURES.map((feature, fi) => (
                    <tr key={feature}>
                      <td className="px-5 py-3.5 font-medium text-[var(--landing-ink)]">
                        {feature}
                      </td>
                      {Object.entries(COMPARISON_DATA).map(([tool, vals], ti) => (
                        <td
                          key={tool}
                          className={`px-5 py-3.5 text-center ${
                            ti === 0 ? "bg-[var(--landing-wash)]/50" : ""
                          }`}
                        >
                          <Cell val={vals[fi]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="bg-[var(--landing-band)] px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-2xl">
          <Eyebrow>Get started</Eyebrow>
          <h2 className={`mt-4 ${sectionHeading}`}>
            Start exploring the future of transit planning.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--landing-muted)]">
            The full GO Transit network, free in your browser: live GTFS, a
            drawing canvas, schedule analysis, and a simulation engine.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <CornerButton href={MAP} solid>
              Open the map →
            </CornerButton>
            <CornerButton
              href="https://github.com/faizm10/transit-flow"
              target="_blank"
            >
              View on GitHub
            </CornerButton>
          </div>
          <SpecMeta
            className="mt-8 block"
            items={["Open source", "No account required", "MIT licensed"]}
          />
        </div>
      </section>

      <MarketingFooter />
    </MarketingShell>
  );
}
