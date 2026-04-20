"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Play } from "lucide-react";

export default function HeroSection() {
  const fade = (delay = 0): Variants => ({
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const, delay } },
  });

  const imageAnim: Variants = {
    hidden: { opacity: 0, x: 24, scale: 0.98 },
    visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.7, ease: "easeOut" as const, delay: 0.2 } },
  };

  return (
    <section className="w-full bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

        {/* LEFT — copy */}
        <div className="flex flex-col gap-6 max-w-lg">
          {/* Badge */}
          <motion.div initial="hidden" animate="visible" variants={fade(0)}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              GO Transit · Live GTFS data
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fade(0.1)}
            className="text-[2.8rem] sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.08]"
          >
            Design transit.<br />
            <span className="text-emerald-600">Watch it run.</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fade(0.2)}
            className="text-[1.05rem] text-slate-500 leading-relaxed"
          >
            Explore every GO Transit route, sketch your own line, and simulate how trains and buses would operate — all from your browser.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade(0.3)}
            className="flex flex-wrap gap-3 pt-1"
          >
            <Link
              href="/map?mode=browse"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 transition-colors"
            >
              Start exploring <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/map?mode=simulate"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold px-5 py-2.5 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Watch simulation
            </Link>
          </motion.div>

          {/* Stat row */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade(0.4)}
            className="flex gap-8 pt-4 border-t border-slate-100 mt-2"
          >
            {[
              { value: "47", label: "GO routes" },
              { value: "7", label: "Rail lines" },
              { value: "100%", label: "Real GTFS data" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* RIGHT — product screenshot */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={imageAnim}
          className="relative"
        >
          {/* Decorative backdrop */}
          <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-slate-100 -z-10" />

          {/* Screenshot frame */}
          <div className="rounded-xl overflow-hidden shadow-2xl shadow-slate-200/80 border border-slate-200/60 ring-1 ring-black/5">
            {/* Fake browser chrome */}
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="flex-1 ml-3 bg-white rounded-md px-3 py-1 text-[10px] text-slate-400 border border-slate-200">
                https://transit-flow-two.vercel.app/map
              </span>
            </div>

            <Image
              src="/landing-page.png"
              alt="TransitFlow map showing GO Transit routes"
              width={960}
              height={600}
              priority
              quality={92}
              className="w-full object-cover object-top"
            />
          </div>
        </motion.div>

      </div>
    </section>
  );
}
