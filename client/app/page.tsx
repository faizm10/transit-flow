"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Train,
  Map,
  PlayCircle,
  ArrowRight,
  CalendarClock,
  Route,
  Search,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { MAP_LINKS } from "@/lib/mapLinks";

/* ─── data ─── */

const MODES = [
  {
    icon: Search,
    tag: "Explore",
    title: "Browse every GO route",
    description:
      "All 45 lines load instantly. Click any route to see stops, service frequency, and headways. Filter by rail or bus corridor.",
    href: MAP_LINKS.exploreNetwork,
    color: "emerald",
    border: "border-emerald-500",
    iconBg: "bg-emerald-500/10 text-emerald-500",
    tagColor: "text-emerald-600 bg-emerald-50",
  },
  {
    icon: Route,
    tag: "Design",
    title: "Sketch a new corridor",
    description:
      "Draw a bus or rail route directly on the map. Place stops, configure departure times, and set how often service runs.",
    href: MAP_LINKS.designFresh,
    color: "blue",
    border: "border-blue-500",
    iconBg: "bg-blue-500/10 text-blue-500",
    tagColor: "text-blue-600 bg-blue-50",
  },
  {
    icon: CalendarClock,
    tag: "Schedules",
    title: "Inspect timetables",
    description:
      "Review departure windows for any GO line. Compare morning peak, midday, and overnight coverage to spot service gaps.",
    href: MAP_LINKS.schedules,
    color: "violet",
    border: "border-violet-500",
    iconBg: "bg-violet-500/10 text-violet-500",
    tagColor: "text-violet-600 bg-violet-50",
  },
  {
    icon: PlayCircle,
    tag: "Simulate",
    title: "Watch it move",
    description:
      "Animate trains and buses across the network in real time. Scrub through any time window and compare against live GO operations.",
    href: MAP_LINKS.simulate,
    color: "orange",
    border: "border-orange-500",
    iconBg: "bg-orange-500/10 text-orange-500",
    tagColor: "text-orange-600 bg-orange-50",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Open the map",
    body: "All 45 GO Transit lines load the moment you arrive — no account needed.",
  },
  {
    n: "02",
    title: "Pick a mode",
    body: "Explore routes, design new corridors, review schedules, or jump straight to the simulation.",
  },
  {
    n: "03",
    title: "Iterate instantly",
    body: "Tweak stops and timetables, then watch trains move. Spot coverage gaps in seconds.",
  },
];

const fade = (delay = 0) => ({
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as number[], delay } },
});

/* ─── page ─── */

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900 antialiased">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Train className="w-3.5 h-3.5 text-slate-950" />
            </div>
            TransitFlow
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm text-slate-400">
            <Link href={MAP_LINKS.exploreNetwork} className="hover:text-white transition-colors">Explore</Link>
            <Link href={MAP_LINKS.designFresh} className="hover:text-white transition-colors">Design</Link>
            <Link href={MAP_LINKS.schedules} className="hover:text-white transition-colors">Schedules</Link>
            <Link href={MAP_LINKS.simulate} className="hover:text-white transition-colors">Simulate</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
          </nav>
          <Link
            href={MAP_LINKS.welcome}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-1.5 rounded-lg transition-colors"
          >
            Open map <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <HeroSection />

      {/* ── Four modes ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fade(0)}
          className="mb-14"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">What you can do</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
            Four modes,<br className="hidden sm:block" /> one map.
          </h2>
          <p className="mt-4 text-slate-500 max-w-lg leading-relaxed">
            Everything lives in the same interactive map — switch between modes at any time without losing your work.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {MODES.map(({ icon: Icon, tag, title, description, href, border, iconBg, tagColor }, i) => (
            <motion.div
              key={tag}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fade(i * 0.08)}
            >
              <Link
                href={href}
                className={`group relative flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden`}
              >
                {/* Top accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${border} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                <div className="flex items-start justify-between mb-5">
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${iconBg}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${tagColor}`}>{tag}</span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-slate-700 transition-colors">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed flex-1">{description}</p>

                <div className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
                  Open mode <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="border-t border-slate-100" />
      </div>

      {/* ── How it works ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fade(0)}
          className="mb-16"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">How it works</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
            Up and running<br className="hidden sm:block" /> in seconds.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ n, title, body }, i) => (
            <motion.div
              key={n}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fade(i * 0.1)}
              className="relative flex flex-col gap-4 rounded-2xl bg-slate-50 p-7 border border-slate-100"
            >
              <span className="text-5xl font-black text-slate-100 leading-none select-none">{n}</span>
              <div>
                <h3 className="font-bold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={fade(0)}
          className="relative rounded-2xl bg-slate-950 px-10 py-16 flex flex-col sm:flex-row items-center justify-between gap-8 overflow-hidden"
        >
          {/* Background glow */}
          <div className="pointer-events-none absolute top-0 left-1/4 w-96 h-48 bg-emerald-500/10 blur-3xl rounded-full" />

          <div className="text-white text-center sm:text-left relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-3 tracking-tight">Ready to explore?</h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md">
              All 45 GO Transit routes are live. No account, no setup — open the map and start.
            </p>
          </div>
          <Link
            href={MAP_LINKS.welcome}
            className="relative z-10 flex-shrink-0 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 whitespace-nowrap"
          >
            <Map className="w-4 h-4" />
            Open the map
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center">
              <Train className="w-2.5 h-2.5 text-slate-950" />
            </div>
            <span className="font-semibold text-slate-600">TransitFlow</span>
            <span>— GO Transit route design &amp; simulation</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            <Link href={MAP_LINKS.exploreNetwork} className="hover:text-slate-600 transition-colors">Explore</Link>
            <Link href={MAP_LINKS.designFresh} className="hover:text-slate-600 transition-colors">Design</Link>
            <Link href={MAP_LINKS.schedules} className="hover:text-slate-600 transition-colors">Schedules</Link>
            <Link href={MAP_LINKS.simulate} className="hover:text-slate-600 transition-colors">Simulate</Link>
            <Link href="/about" className="hover:text-slate-600 transition-colors">About</Link>
            <span className="hidden sm:inline text-slate-200" aria-hidden>|</span>
            <a href="https://github.com/faizm10/transit-flow" className="hover:text-slate-600 transition-colors">GitHub</a>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

    </main>
  );
}
