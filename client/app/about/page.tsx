import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Map, Pencil, PlayCircle } from "lucide-react";
import { MAP_LINKS } from "@/lib/mapLinks";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "About TransitFlow",
  description:
    "Learn what TransitFlow does in simple words: explore GO Transit, design routes, and run basic simulations.",
};

const SIMPLE_STEPS = [
  {
    icon: Map,
    title: "See the network",
    body: "Open the map and look at GO Transit routes, stops, and route options.",
  },
  {
    icon: Pencil,
    title: "Make your own route",
    body: "Create a new bus or train route, add stops, and choose how often it runs.",
  },
  {
    icon: PlayCircle,
    title: "Test the idea",
    body: "Run a simulation to see how the route would move during the day.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <MarketingHeader />

      <main>
        <section className="border-b border-[var(--landing-border)] bg-[var(--landing-band)]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:py-16 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
                About
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl">
                TransitFlow in simple words
              </h1>
              <p className="mt-5 text-base leading-relaxed text-[var(--landing-muted)] sm:text-lg">
                TransitFlow is a map tool for trying out transit ideas. You can look at the GO Transit
                network, draw your own routes, change stops and schedules, and see how a route might run.
              </p>
            </div>

            <ul className="mt-12 grid gap-3 sm:grid-cols-3">
              {SIMPLE_STEPS.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-6"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--landing-border)] bg-[var(--landing-band)] text-[var(--landing-fg)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h2 className="text-base font-semibold text-[var(--landing-fg)]">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--landing-muted)]">{body}</p>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[var(--landing-fg)] sm:text-xl">What you can do here</h2>
              <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-[var(--landing-muted)] marker:text-[var(--landing-muted)]">
                <li>Browse GO train and bus routes on a live map.</li>
                <li>Create your own route from scratch.</li>
                <li>Extend an existing GO line with new stops.</li>
                <li>Change route schedules and departure times.</li>
                <li>Run a basic simulation to watch vehicles move.</li>
              </ul>
            </div>

            <div className="mt-8 rounded-xl border border-[var(--landing-mixed-border)] bg-[var(--landing-mixed-bg)] p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[var(--landing-mixed-fg)] sm:text-xl">
                Why this project exists
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--landing-mixed-muted)]">
                It helps people explore transit ideas without needing complicated planning software. The
                goal is to make route planning easier to understand and easier to test.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={MAP_LINKS.welcome}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--landing-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#006b2d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-mixed-bg)]"
                >
                  Open the map
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href={MAP_LINKS.designFresh}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--landing-mixed-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--landing-mixed-fg)] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-mixed-bg)]"
                >
                  Start designing
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
