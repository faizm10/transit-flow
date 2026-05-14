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
  ChevronRight,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";

const MAP = "/map";

/* ─── helpers ─── */

const reveal = (delay = 0) => ({
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay },
  },
});

/* ─── page ─── */

export default function LandingPage() {
  return (
    <main className="bg-white text-slate-900 antialiased overflow-x-hidden">

      {/* ════════════════════════════════════════ NAV */}
      <header className="fixed top-0 inset-x-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Train className="w-3.5 h-3.5 text-slate-950" />
            </div>
            TransitFlow
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {[
              { label: "Explore", href: MAP },
              { label: "Design", href: MAP },
              { label: "Schedules", href: MAP },
              { label: "Simulate", href: MAP },
              { label: "About", href: "/about" },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                {label}
              </Link>
            ))}
          </nav>

          <Link
            href={MAP}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
          >
            Open map <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* ════════════════════════════════════════ HERO */}
      <HeroSection />

      {/* ════════════════════════════════════════ BENTO */}
      <section className="bg-slate-950 pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">

          {/* Section label */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={reveal(0)}
            className="pt-24 pb-10"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-3">Platform</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tighter text-white leading-tight">
              Four modes.<br />One map.
            </h2>
          </motion.div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

            {/* ── Explore — large ── */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={reveal(0.05)}
              className="md:col-span-7"
            >
              <Link
                href={MAP}
                className="group relative flex flex-col h-full min-h-[280px] rounded-2xl bg-emerald-950/40 border border-emerald-500/20 p-8 overflow-hidden hover:border-emerald-500/40 transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
                <div className="absolute -right-10 -bottom-10 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 mb-auto">
                    <Search className="w-5 h-5" />
                  </div>
                  <div className="mt-8">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500 mb-2">Explore</p>
                    <h3 className="text-2xl font-bold text-white mb-2">Browse the network</h3>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-sm">All 45 GO Transit lines on a live map. Click any route for stops, headways, and real GTFS frequency data.</p>
                  </div>
                  <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open Explore <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* ── Stats column ── */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={reveal(0.1)}
              className="md:col-span-5 flex flex-col gap-4"
            >
              {[
                { n: "45", label: "GO Transit routes", sub: "Bus + rail" },
                { n: "8", label: "Rail lines", sub: "Lakeshore, Kitchener, Barrie + more" },
                { n: "250+", label: "Route variants", sub: "All directions & branches" },
              ].map(({ n, label, sub }) => (
                <div key={label} className="flex-1 rounded-2xl bg-white/[0.04] border border-white/[0.07] px-6 py-5 flex items-center gap-5">
                  <span className="text-3xl font-black text-white tabular-nums">{n}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* ── Design ── */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={reveal(0.08)}
              className="md:col-span-4"
            >
              <Link
                href={MAP}
                className="group relative flex flex-col h-full min-h-[220px] rounded-2xl bg-blue-950/40 border border-blue-500/20 p-7 overflow-hidden hover:border-blue-500/40 transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 mb-auto">
                    <Route className="w-5 h-5" />
                  </div>
                  <div className="mt-6">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400 mb-2">Design</p>
                    <h3 className="text-xl font-bold text-white mb-1.5">Sketch a route</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Draw corridors, place stops, set headways.</p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open Design <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* ── Simulate ── */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={reveal(0.12)}
              className="md:col-span-4"
            >
              <Link
                href={MAP}
                className="group relative flex flex-col h-full min-h-[220px] rounded-2xl bg-orange-950/40 border border-orange-500/20 p-7 overflow-hidden hover:border-orange-500/40 transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 mb-auto">
                    <PlayCircle className="w-5 h-5" />
                  </div>
                  <div className="mt-6">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-400 mb-2">Simulate</p>
                    <h3 className="text-xl font-bold text-white mb-1.5">Watch it move</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Animate trains and buses, scrub through time.</p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open Simulate <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* ── Schedules ── */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={reveal(0.15)}
              className="md:col-span-4"
            >
              <Link
                href={MAP}
                className="group relative flex flex-col h-full min-h-[220px] rounded-2xl bg-violet-950/40 border border-violet-500/20 p-7 overflow-hidden hover:border-violet-500/40 transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 mb-auto">
                    <CalendarClock className="w-5 h-5" />
                  </div>
                  <div className="mt-6">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-400 mb-2">Schedules</p>
                    <h3 className="text-xl font-bold text-white mb-1.5">Inspect timetables</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Compare headways across any GO line.</p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open Schedules <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════ STATEMENT */}
      <section className="bg-white py-32 px-6 lg:px-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={reveal(0)}
          className="max-w-4xl mx-auto text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-6">Why TransitFlow</p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[1.0] text-slate-900">
            Transit planning is hard enough.{" "}
            <span className="text-slate-300">Visualizing it shouldn&apos;t be.</span>
          </h2>
          <p className="mt-8 text-slate-500 text-lg leading-relaxed max-w-2xl mx-auto">
            TransitFlow puts the entire GO Transit network in your hands — live data, a drawing canvas, timetable views, and a full simulation engine — all in one map.
          </p>
          <Link
            href={MAP}
            className="inline-flex items-center gap-2 mt-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-6 py-3.5 transition-colors"
          >
            Try it now — no sign up <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════ HOW IT WORKS */}
      <section className="bg-slate-50 border-y border-slate-100 py-28 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={reveal(0)}
            className="mb-16"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">How it works</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tighter text-slate-900">
              Three steps.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 rounded-2xl overflow-hidden">
            {[
              {
                n: "01",
                title: "Open the map",
                body: "All 45 GO Transit lines load immediately. No account, no setup, no waiting.",
                color: "text-emerald-600",
              },
              {
                n: "02",
                title: "Pick your mode",
                body: "Explore routes, sketch corridors in Design, check timetables, or jump into Simulate.",
                color: "text-blue-600",
              },
              {
                n: "03",
                title: "Iterate",
                body: "Adjust stops, tweak schedules, replay the simulation. Everything updates instantly.",
                color: "text-violet-600",
              },
            ].map(({ n, title, body, color }, i) => (
              <motion.div
                key={n}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                variants={reveal(i * 0.08)}
                className="bg-white px-10 py-12"
              >
                <p className={`text-6xl font-black ${color} opacity-20 leading-none mb-6`}>{n}</p>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════ FINAL CTA */}
      <section className="relative bg-slate-950 overflow-hidden py-36 px-6 lg:px-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] bg-emerald-500/8 blur-[120px] rounded-full" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={reveal(0)}
          className="relative max-w-3xl mx-auto text-center"
        >
          <h2 className="text-5xl sm:text-6xl font-black tracking-tighter text-white leading-tight mb-6">
            Ready to explore<br />the network?
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
            Open the map and every GO Transit route is right there. No account needed.
          </p>
          <Link
            href={MAP}
            className="inline-flex items-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base px-8 py-4 rounded-xl transition-colors shadow-2xl shadow-emerald-500/20"
          >
            <Map className="w-5 h-5" />
            Open TransitFlow
          </Link>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════ FOOTER */}
      <footer className="bg-slate-950 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
              <Train className="w-3 h-3 text-slate-950" />
            </div>
            <span className="text-sm font-semibold text-white">TransitFlow</span>
            <span className="text-xs text-slate-600">— GO Transit design &amp; simulation</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <Link href={MAP} className="hover:text-slate-300 transition-colors">Explore</Link>
            <Link href={MAP} className="hover:text-slate-300 transition-colors">Design</Link>
            <Link href={MAP} className="hover:text-slate-300 transition-colors">Schedules</Link>
            <Link href={MAP} className="hover:text-slate-300 transition-colors">Simulate</Link>
            <Link href="/about" className="hover:text-slate-300 transition-colors">About</Link>
            <a href="https://github.com/faizm10/transit-flow" className="hover:text-slate-300 transition-colors">GitHub</a>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

    </main>
  );
}
