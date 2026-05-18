import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
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

const DOT_BG =
  "background-image:radial-gradient(circle,#e2e8f0 1px,transparent 1px);background-size:20px 20px";

export default function AboutPage() {
  return (
    <MarketingShell>
      <MarketingHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-14 lg:px-8 lg:py-20">

        {/* ── Bento grid ─────────────────────────────────────────────────── */}
        <div className="grid auto-rows-auto grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

          {/* Hero — spans 2 cols */}
          <div
            className="relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white p-8 sm:col-span-2"
            style={{ backgroundImage: "radial-gradient(circle,#e2e8f0 1px,transparent 1px)", backgroundSize: "20px 20px" }}
          >
            <div className="relative z-10">
              <span className="inline-block rounded-full border border-dashed border-[#007A33]/40 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#007A33]">
                About
              </span>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Design transit.<br />See it move.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">
                TransitFlow is a browser-based tool for exploring the GO Transit network,
                drawing your own routes, and simulating how they'd run — no planning software required.
              </p>
            </div>
          </div>

          {/* Explore card */}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-6">
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <Map className="h-5 w-5 text-slate-600" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">See the network</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Browse all GO Transit train and bus routes on a live interactive map with real GTFS data.
              </p>
            </div>
          </div>

          {/* Design card */}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-6">
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <Pencil className="h-5 w-5 text-slate-600" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Design a route</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Create a new bus or train route from scratch — draw the path, add stops, set the schedule.
              </p>
            </div>
          </div>

          {/* Simulate card */}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-6">
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <PlayCircle className="h-5 w-5 text-slate-600" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Simulate it</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Run a time-of-day simulation and watch vehicles move along the network in real time.
              </p>
            </div>
          </div>

          {/* Community card */}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-6">
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <Users className="h-5 w-5 text-slate-600" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Share & browse</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Post your network designs to the community and load others' ideas directly into your map.
              </p>
            </div>
          </div>

          {/* What you can do — spans 2 cols */}
          <div
            className="relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white p-8 sm:col-span-2"
          >
            <h2 className="text-lg font-semibold text-slate-900">What you can do</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Route,  text: "Browse all GO train & bus routes on a live map" },
                { icon: Pencil, text: "Create routes from scratch or extend existing GO lines" },
                { icon: Clock,  text: "Set custom schedules — frequency or fixed departure times" },
                { icon: PlayCircle, text: "Simulate vehicle movement at any time of day" },
                { icon: Users,  text: "Share designs with the community and load theirs" },
                { icon: Zap,    text: "AI-assisted route suggestions and schedule optimisation" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50">
                    <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                  </span>
                  <span className="text-sm leading-relaxed text-slate-600">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Why card */}
          <div
            className="relative overflow-hidden rounded-2xl border border-dashed border-[#007A33]/40 p-8 sm:col-span-2 lg:col-span-1"
            style={{ backgroundImage: "radial-gradient(circle,#bbf7d0 1px,transparent 1px)", backgroundSize: "20px 20px", backgroundColor: "#f0fdf4" }}
          >
            <div className="relative z-10">
              <h2 className="text-lg font-semibold text-slate-900">Why it exists</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Transit planning tools are complicated and expensive. TransitFlow makes it easy to sketch,
                test, and share ideas — for students, enthusiasts, and curious commuters.
              </p>
            </div>
          </div>

          {/* CTA card */}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-900 p-8 sm:col-span-2 lg:col-span-2">
            <div>
              <h2 className="text-xl font-semibold text-white">Ready to explore?</h2>
              <p className="mt-2 text-sm text-slate-400">
                Open the map and start designing. No account required.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={MAP_LINKS.welcome}
                className="inline-flex items-center gap-2 rounded-xl bg-[#007A33] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#005f28]"
              >
                Open the map
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={MAP_LINKS.designFresh}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-600 bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
              >
                Start designing
              </Link>
            </div>
          </div>

        </div>
      </main>

      <MarketingFooter />
    </MarketingShell>
  );
}
