"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Play, Zap } from "lucide-react";
import { MAP_LINKS } from "@/lib/mapLinks";

export default function HeroSection() {
  const fade = (delay = 0): Variants => ({
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay } },
  });

  const imageAnim: Variants = {
    hidden: { opacity: 0, y: 32, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 } },
  };

  return (
    <section className="relative w-full overflow-hidden bg-slate-950">
      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Emerald glow top-right */}
      <div className="pointer-events-none absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
      {/* Subtle bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-20 pb-0 lg:pt-28 flex flex-col items-center text-center gap-8">

        {/* Badge */}
        <motion.div initial="hidden" animate="visible" variants={fade(0)}>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 text-xs font-medium text-slate-400 bg-white/5 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Live GO Transit GTFS data
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fade(0.1)}
          className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] text-white max-w-4xl"
        >
          The GO Transit network,{" "}
          <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            reimagined.
          </span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial="hidden"
          animate="visible"
          variants={fade(0.2)}
          className="text-lg text-slate-400 leading-relaxed max-w-xl"
        >
          All 45 GO Transit routes on a live interactive map. Explore lines, sketch new corridors, compare timetables, and simulate service — all in your browser.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fade(0.3)}
          className="flex flex-wrap justify-center gap-3"
        >
          <Link
            href={MAP_LINKS.exploreNetwork}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold px-6 py-3 transition-colors shadow-lg shadow-emerald-500/20"
          >
            Open the map <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href={MAP_LINKS.simulate}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold px-6 py-3 transition-colors backdrop-blur-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Watch a simulation
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fade(0.4)}
          className="flex gap-10 pt-2"
        >
          {[
            { value: "45", label: "GO routes" },
            { value: "8", label: "Rail lines" },
            { value: "Live", label: "GTFS data" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Screenshot */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={imageAnim}
          className="relative w-full max-w-5xl mt-6"
        >
          {/* Glow beneath screenshot */}
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-emerald-500/15 blur-3xl rounded-full" />

          <div className="relative rounded-t-xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60">
            {/* Browser chrome */}
            <div className="bg-slate-900 border-b border-white/10 px-4 py-3 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              <span className="flex-1 ml-3 bg-white/5 rounded-md px-3 py-1 text-[11px] text-slate-500 border border-white/5 truncate text-left">
                transitflow.app/map
              </span>
              <Zap className="w-3 h-3 text-emerald-500 ml-2" />
            </div>
            <Image
              src="/landing-page.png"
              alt="TransitFlow map showing GO Transit routes"
              width={1200}
              height={700}
              priority
              quality={95}
              className="w-full object-cover object-top"
            />
          </div>
        </motion.div>

      </div>
    </section>
  );
}
