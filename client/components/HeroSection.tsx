"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Play } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen bg-slate-950 flex flex-col overflow-hidden">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-0 left-0 w-[800px] h-[500px] bg-emerald-500/8 blur-[160px] rounded-full -translate-x-1/2 -translate-y-1/4" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[600px] h-[400px] bg-teal-400/6 blur-[140px] rounded-full translate-x-1/3 translate-y-1/4" />

      {/* Content wrapper */}
      <div className="relative flex flex-col lg:flex-row items-center flex-1 max-w-[1600px] mx-auto w-full px-6 lg:pl-20 lg:pr-0 pt-24 pb-0 gap-12 lg:gap-0">

        {/* ── Left column ── */}
        <div className="flex flex-col gap-8 lg:w-[520px] shrink-0">

          {/* Live pill */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 border border-white/10 rounded-full px-3 py-1 bg-white/[0.04]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live GO Transit GTFS · 45 routes
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[3.4rem] sm:text-[4.5rem] font-black leading-[0.95] tracking-tighter text-white"
          >
            Plan transit.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500">
              See it move.
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-base text-slate-400 leading-relaxed max-w-sm"
          >
            Every GO Transit route on a live interactive map. Explore lines, design new corridors, compare timetables, and simulate real service — right in your browser.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.28 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-sm px-6 py-3.5 transition-all shadow-xl shadow-emerald-500/25"
            >
              Open the map <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/10 active:scale-95 text-white font-semibold text-sm px-6 py-3.5 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Watch simulation
            </Link>
          </motion.div>

          {/* Stat strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.38 }}
            className="flex gap-8 pt-4 border-t border-white/[0.08]"
          >
            {[
              { n: "45", label: "Routes" },
              { n: "8", label: "Rail lines" },
              { n: "250+", label: "Variants" },
            ].map(({ n, label }) => (
              <div key={label}>
                <p className="text-xl font-bold text-white">{n}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Right — screenshot bleeds off ── */}
        <motion.div
          initial={{ opacity: 0, x: 40, y: 16 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex-1 lg:self-end w-full lg:w-auto"
        >
          {/* Glow under screenshot */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-24 bg-emerald-500/20 blur-3xl rounded-full" />

          <div className="relative rounded-tl-2xl overflow-hidden border-t border-l border-white/10 shadow-[0_-8px_80px_rgba(0,0,0,0.5)]">
            {/* Browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#0d1117] border-b border-white/[0.06]">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              <div className="flex-1 ml-2 bg-white/[0.05] rounded-md px-3 py-1 text-[11px] text-slate-500 border border-white/[0.04] truncate">
                transitflow.app/map
              </div>
            </div>
            <Image
              src="/landing-page.png"
              alt="TransitFlow interactive map"
              width={1200}
              height={720}
              priority
              quality={96}
              className="w-full object-cover object-top"
            />
          </div>
        </motion.div>

      </div>
    </section>
  );
}
