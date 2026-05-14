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
    title: "Browse the GO network",
    description:
      "Every GO Transit route loads instantly. Click any line to see stops, headways, and service frequency. Filter by rail or bus.",
    href: MAP_LINKS.exploreNetwork,
    accent: "bg-emerald-50 text-emerald-700",
    border: "border-emerald-100",
    hover: "hover:border-emerald-200",
  },
  {
    icon: Route,
    tag: "Design",
    title: "Sketch a new route",
    description:
      "Draw a bus or rail corridor on the map. Place stops, set departure times, and configure how often service runs.",
    href: MAP_LINKS.designFresh,
    accent: "bg-blue-50 text-blue-700",
    border: "border-blue-100",
    hover: "hover:border-blue-200",
  },
  {
    icon: CalendarClock,
    tag: "Schedules",
    title: "Compare timetables",
    description:
      "Inspect departure times and service windows for any GO line. Spot gaps in morning peak, midday, and overnight coverage.",
    href: MAP_LINKS.schedules,
    accent: "bg-violet-50 text-violet-700",
    border: "border-violet-100",
    hover: "hover:border-violet-200",
  },
  {
    icon: PlayCircle,
    tag: "Simulate",
    title: "Watch it move",
    description:
      "Animate trains and buses across the network in real time. Scrub through any time window and compare your routes against live GO operations.",
    href: MAP_LINKS.simulate,
    accent: "bg-orange-50 text-orange-700",
    border: "border-orange-100",
    hover: "hover:border-orange-200",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Open the map",
    body: "All 45 GO Transit lines load the moment you arrive — no setup needed.",
  },
  {
    n: "02",
    title: "Pick a mode",
    body: "Explore routes, design new corridors, review schedules, or jump straight to the simulation.",
  },
  {
    n: "03",
    title: "Iterate",
    body: "Tweak stops and timetables, then watch trains move. Spot coverage gaps instantly.",
  },
];

const fade = (delay = 0) => ({
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const, delay } },
});

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
            <Link href={MAP_LINKS.exploreNetwork} className="hover:text-slate-900 transition-colors">Explore</Link>
            <Link href={MAP_LINKS.designFresh} className="hover:text-slate-900 transition-colors">Design</Link>
            <Link href={MAP_LINKS.schedules} className="hover:text-slate-900 transition-colors">Schedules</Link>
            <Link href={MAP_LINKS.simulate} className="hover:text-slate-900 transition-colors">Simulate</Link>
            <Link href="/about" className="hover:text-slate-900 transition-colors">About</Link>
          </nav>
          <Link
            href={MAP_LINKS.welcome}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            Open map <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <HeroSection />

      {/* ── Four modes ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fade(0)}
          className="mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">What you can do</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 max-w-xl">
            Four modes, one map
          </h2>
          <p className="mt-3 text-slate-500 text-sm max-w-lg leading-relaxed">
            Everything lives in the same interactive map — switch between modes at any time without losing your work.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODES.map(({ icon: Icon, tag, title, description, href, accent, border, hover }, i) => (
            <motion.div
              key={tag}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fade(i * 0.07)}
            >
              <Link
                href={href}
                className={`group flex h-full flex-col rounded-xl border ${border} ${hover} bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md`}
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
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="border-t border-slate-100" />
      </div>

      {/* ── How it works ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fade(0)}
          className="mb-16 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Up and running in seconds
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
          <div className="hidden sm:block absolute top-7 left-[20%] right-[20%] h-px bg-slate-200" />

          {STEPS.map(({ n, title, body }, i) => (
            <motion.div
              key={n}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fade(i * 0.1)}
              className="flex flex-col items-center text-center relative"
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5 z-10">
                <span className="text-sm font-bold text-slate-700">{n}</span>
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[200px]">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={fade(0)}
          className="rounded-2xl bg-emerald-600 px-10 py-14 flex flex-col sm:flex-row items-center justify-between gap-8"
        >
          <div className="text-white text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Ready to explore the network?</h2>
            <p className="text-emerald-100 text-sm leading-relaxed max-w-md">
              All 45 GO Transit routes are live. No account, no setup — open the map and start.
            </p>
          </div>
          <Link
            href={MAP_LINKS.welcome}
            className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-semibold text-sm px-6 py-3 rounded-lg transition-colors shadow-sm whitespace-nowrap"
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
            <div className="w-5 h-5 rounded-md bg-emerald-600 flex items-center justify-center">
              <Train className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="font-medium text-slate-500">TransitFlow</span>
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
