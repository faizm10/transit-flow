"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Train,
  Map,
  PlayCircle,
  ArrowRight,
  Layers,
  Clock,
  Route,
  GitBranch,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { MAP_LINKS } from "@/lib/mapLinks";

/* ─── data ─── */

const FEATURES = [
  {
    icon: Map,
    title: "Explore GO routes",
    description:
      "See all 47 GO Transit lines on an interactive map. Tap any line to inspect stops, schedules, and frequencies.",
    href: MAP_LINKS.exploreNetwork,
    accent: "bg-emerald-50 text-emerald-700",
    border: "border-emerald-100",
    tag: "Explore",
  },
  {
    icon: Route,
    title: "Design a route",
    description:
      "Sketch a new bus or rail corridor from scratch. Add stops, set service frequency, and define the schedule.",
    href: MAP_LINKS.designFresh,
    accent: "bg-blue-50 text-blue-700",
    border: "border-blue-100",
    tag: "Design",
  },
  {
    icon: PlayCircle,
    title: "Simulate service",
    description:
      "Watch your route animate in real-time across the network. Compare it against live GO Transit operations.",
    href: MAP_LINKS.simulate,
    accent: "bg-violet-50 text-violet-700",
    border: "border-violet-100",
    tag: "Simulate",
  },
  {
    icon: GitBranch,
    title: "Extend existing lines",
    description:
      "Take any GO rail line and add new stops or branches. The timetable auto-adjusts to keep spacing consistent.",
    href: MAP_LINKS.extendGo,
    accent: "bg-orange-50 text-orange-700",
    border: "border-orange-100",
    tag: "Extend",
  },
  {
    icon: Layers,
    title: "Multi-layer view",
    description:
      "Toggle between GO trains, buses, and your custom routes simultaneously. Filter by mode or corridor.",
    href: MAP_LINKS.exploreNetwork,
    accent: "bg-sky-50 text-sky-700",
    border: "border-sky-100",
    tag: "Layers",
  },
  {
    icon: Clock,
    title: "Time-of-day control",
    description:
      "Scrub through morning rush, midday, evening peak, and overnight service windows to spot coverage gaps.",
    href: MAP_LINKS.simulate,
    accent: "bg-rose-50 text-rose-700",
    border: "border-rose-100",
    tag: "Schedule",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Pick a route",
    body: "Browse the full GO Transit network or start with a blank slate.",
  },
  {
    n: "02",
    title: "Design or extend",
    body: "Draw new stops, extend rail lines, and configure departure times.",
  },
  {
    n: "03",
    title: "Run the simulation",
    body: "Watch trains and buses move. Spot gaps. Iterate instantly.",
  },
];

/* ─── page ─── */

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900 antialiased">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Train className="w-3.5 h-3.5 text-white" />
            </div>
            TransitFlow
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm text-slate-500">
            <Link href={MAP_LINKS.welcome} className="hover:text-slate-900 transition-colors">
              Map
            </Link>
            <Link href={MAP_LINKS.exploreNetwork} className="hover:text-slate-900 transition-colors">
              Explore
            </Link>
            <Link href={MAP_LINKS.designFresh} className="hover:text-slate-900 transition-colors">
              Design
            </Link>
            <Link href={MAP_LINKS.schedules} className="hover:text-slate-900 transition-colors">
              Schedules
            </Link>
            <Link href={MAP_LINKS.simulate} className="hover:text-slate-900 transition-colors">
              Simulate
            </Link>
            <Link href="/about" className="hover:text-slate-900 transition-colors">
              About
            </Link>
          </nav>
          <Link
            href={MAP_LINKS.welcome}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            Open map <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero (animated) ── */}
      <HeroSection />

      {/* ── Features grid ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <div className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">Platform</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 max-w-xl">
            Everything you need to model transit
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, description, href, accent, border, tag }) => (
            <Link
              key={title}
              href={href}
              className="group flex flex-col h-full rounded-xl border border-slate-100 bg-white p-6 hover:border-slate-200 hover:shadow-md transition-all duration-200"
            >
              <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border ${accent} ${border} mb-4`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{tag}</p>
              <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-emerald-700 transition-colors">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed flex-1">{description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                Open <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="border-t border-slate-100" />
      </div>

      {/* ── How it works ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <div className="mb-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Three steps to a working route
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden sm:block absolute top-7 left-[20%] right-[20%] h-px bg-slate-200" />

          {STEPS.map(({ n, title, body }) => (
            <div key={n} className="flex flex-col items-center text-center relative">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5 z-10 bg-white">
                <span className="text-sm font-bold text-slate-700">{n}</span>
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[200px]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <div className="rounded-2xl bg-emerald-600 px-10 py-14 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="text-white text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Ready to explore the network?</h2>
            <p className="text-emerald-100 text-sm leading-relaxed max-w-md">
              Jump straight into the interactive map — no account needed.
            </p>
          </div>
          <Link
            href={MAP_LINKS.welcome}
            className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-semibold text-sm px-6 py-3 rounded-lg transition-colors shadow-sm whitespace-nowrap"
          >
            Open the map <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-600 flex items-center justify-center">
              <Train className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="font-medium text-slate-500">TransitFlow</span>
            <span>— GO Transit route design &amp; simulation</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            <Link href={MAP_LINKS.welcome} className="hover:text-slate-600 transition-colors">
              Map
            </Link>
            <Link href={MAP_LINKS.exploreNetwork} className="hover:text-slate-600 transition-colors">
              Explore GO
            </Link>
            <Link href={MAP_LINKS.designFresh} className="hover:text-slate-600 transition-colors">
              New route
            </Link>
            <Link href={MAP_LINKS.simulate} className="hover:text-slate-600 transition-colors">
              Simulate
            </Link>
            <Link href="/about" className="hover:text-slate-600 transition-colors">
              About
            </Link>
            <span className="hidden sm:inline text-slate-200" aria-hidden>
              |
            </span>
            <a href="https://github.com/faizm10/transit-flow" className="hover:text-slate-600 transition-colors">
              GitHub
            </a>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

    </main>
  );
}
