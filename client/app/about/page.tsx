import type { Metadata } from "next";
import {
  Map,
  Pencil,
  PlayCircle,
  Users,
  Route,
  Clock,
  Zap,
} from "lucide-react";
import { MAP_LINKS } from "@/lib/mapLinks";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { Eyebrow, CornerButton, SpecMeta } from "@/components/marketing/spec";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "About",
  description:
    "TransitFlow is a free, browser-based tool for exploring the GO Transit network, designing custom routes, and simulating transit service — no planning software required.",
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: "About — TransitFlow",
    description:
      "TransitFlow is a free, browser-based tool for exploring the GO Transit network, designing custom routes, and simulating transit service — no planning software required.",
    url: `${SITE_URL}/about`,
  },
};

const CARDS = [
  {
    icon: Map,
    title: "See the network",
    body: "Browse all GO Transit train and bus routes on a live interactive map with real GTFS data.",
  },
  {
    icon: Pencil,
    title: "Design a route",
    body: "Create a new bus or train route from scratch — draw the path, add stops, set the schedule.",
  },
  {
    icon: PlayCircle,
    title: "Simulate it",
    body: "Run a time-of-day simulation and watch vehicles move along the network in real time.",
  },
  {
    icon: Users,
    title: "Share & browse",
    body: "Post your network designs to the community and load others' ideas directly into your map.",
  },
] as const;

const CAPABILITIES = [
  { icon: Route, text: "Browse all GO train & bus routes on a live map" },
  { icon: Pencil, text: "Create routes from scratch or extend existing GO lines" },
  { icon: Clock, text: "Set custom schedules — frequency or fixed departure times" },
  { icon: PlayCircle, text: "Simulate vehicle movement at any time of day" },
  { icon: Users, text: "Share designs with the community and load theirs" },
  { icon: Zap, text: "AI-assisted route suggestions and schedule optimisation" },
] as const;

export default function AboutPage() {
  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-28 pt-14 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-[var(--landing-border)] pb-12">
          <Eyebrow>About</Eyebrow>
          <h1 className="font-[family-name:var(--font-hanken)] text-[2.75rem] font-normal leading-[1.03] tracking-[-0.03em] text-[var(--landing-ink)] sm:text-[3.25rem]">
            Design transit. See it move.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[var(--landing-muted)]">
            TransitFlow is a browser-based tool for exploring the GO Transit
            network, drawing your own routes, and simulating how they&apos;d run
            — no planning software required.
          </p>
        </header>

        {/* Four cards */}
        <div className="mt-14 grid border-t border-l border-[var(--landing-border)] sm:grid-cols-2">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="border-b border-r border-[var(--landing-border)] p-6"
            >
              <Icon
                className="h-5 w-5 text-[var(--landing-accent)]"
                aria-hidden
              />
              <h2 className="mt-4 font-[family-name:var(--font-hanken)] text-base font-medium text-[var(--landing-ink)]">
                {title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--landing-muted)]">
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* What you can do */}
        <section className="mt-16">
          <Eyebrow>What you can do</Eyebrow>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--landing-accent)]"
                  aria-hidden
                />
                <span className="text-sm leading-relaxed text-[var(--landing-fg)]">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Why */}
        <section className="mt-16 border-l border-[var(--landing-accent)] pl-5">
          <h2 className="font-[family-name:var(--font-hanken)] text-lg font-medium text-[var(--landing-ink)]">
            Why it exists
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--landing-muted)]">
            Transit planning tools are complicated and expensive. TransitFlow
            makes it easy to sketch, test, and share ideas — for students,
            enthusiasts, and curious commuters.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-16 border-t border-[var(--landing-border)] pt-10">
          <h2 className="font-[family-name:var(--font-hanken)] text-xl font-medium text-[var(--landing-ink)]">
            Ready to explore?
          </h2>
          <p className="mt-1.5 text-sm text-[var(--landing-muted)]">
            Open the map and start designing. No account required.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CornerButton href={MAP_LINKS.welcome} solid>
              Open the map →
            </CornerButton>
            <CornerButton href={MAP_LINKS.designFresh}>
              Start designing
            </CornerButton>
          </div>
          <SpecMeta
            className="mt-8 block"
            items={["Free", "No install", "Open source"]}
          />
        </section>
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
