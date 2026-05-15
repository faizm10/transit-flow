"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  HeroModeSpotlight,
  type HeroModeId,
} from "@/components/marketing/hero/HeroModeSpotlight";

const MAP = "/map";

const SECONDARY_CTA: Record<HeroModeId, string> = {
  explore: "Browse the network",
  design: "Open design mode",
  simulate: "Jump to simulation",
  schedules: "Inspect schedules",
};

export default function HeroSection() {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<HeroModeId>("explore");

  const instant = reduceMotion ? { opacity: 1, y: 0, x: 0 } : undefined;
  const fadeUp = () => (reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 });
  const fadeUpTrans = (delay: number) =>
    reduceMotion ? { duration: 0 } : { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <section className="relative overflow-hidden border-b border-[var(--landing-border)] bg-[var(--landing-bg)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
      >
        <div
          className="absolute -left-1/4 top-0 h-[min(70vw,480px)] w-[min(90vw,640px)] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--landing-accent) 22%, transparent), transparent 72%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-5 pb-20 pt-10 sm:pb-24 sm:pt-14 lg:flex-row lg:items-center lg:gap-20 lg:px-8 lg:pb-28 lg:pt-16">
        <div className="flex max-w-xl flex-col gap-7 lg:max-w-[min(100%,520px)]">
          <motion.p
            initial={instant ?? fadeUp()}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeUpTrans(0)}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-3 py-1 text-xs font-medium text-[var(--landing-muted)] shadow-[0_1px_0_color-mix(in_oklab,var(--landing-fg)_6%,transparent)]"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--landing-accent)]" />
            </span>
            Live GO Transit GTFS · 45 routes
          </motion.p>

          <motion.h1
            initial={instant ?? fadeUp()}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeUpTrans(0.04)}
            className="text-[2rem] font-semibold leading-[1.08] tracking-tight text-[var(--landing-fg)] sm:text-5xl sm:leading-[1.06] lg:text-[3.25rem]"
          >
            Plan transit.
            <br />
            See it move.
          </motion.h1>

          <motion.p
            initial={instant ?? fadeUp()}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeUpTrans(0.06)}
            className="max-w-lg text-lg leading-relaxed text-[var(--landing-muted)]"
          >
            Turn the GO network into a canvas — explore lines, sketch corridors, compare timetables, and
            simulate service in one place.
          </motion.p>

          <motion.div
            initial={instant ?? fadeUp()}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeUpTrans(0.08)}
          >
            <HeroModeSpotlight active={mode} onChange={setMode} reduceMotion={!!reduceMotion} />
          </motion.div>

          <motion.div
            initial={instant ?? fadeUp()}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeUpTrans(0.11)}
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <motion.div whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="inline-flex">
              <Link
                href={MAP}
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--landing-accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow] hover:bg-[#006b2d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
              >
                Open the map
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </motion.div>
            <Link
              href="/#how-it-works"
              className="inline-flex items-center justify-center rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-6 py-3.5 text-center text-sm font-semibold text-[var(--landing-fg)] shadow-[0_1px_0_color-mix(in_oklab,var(--landing-fg)_5%,transparent)] transition-[background-color,border-color] hover:border-[color-mix(in_oklab,var(--landing-fg)_18%,var(--landing-border))] hover:bg-[var(--landing-band)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
            >
              How it works
            </Link>
            <Link
              href={MAP}
              className="text-center text-sm font-medium text-[var(--landing-accent)] underline-offset-4 transition-colors hover:text-[#006b2d] hover:underline sm:text-left"
            >
              {SECONDARY_CTA[mode]}
            </Link>
          </motion.div>

          <motion.div
            initial={instant ?? { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.16 }}
            className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-3 shadow-[0_12px_40px_-28px_color-mix(in_oklab,var(--landing-fg)_35%,transparent)] sm:gap-3 sm:p-4"
          >
            {[
              { n: "45", label: "Routes" },
              { n: "8", label: "Rail lines" },
              { n: "250+", label: "Variants" },
            ].map(({ n, label }) => (
              <div
                key={label}
                className="rounded-xl px-2 py-2 text-center transition-[background-color] hover:bg-[var(--landing-band)] sm:text-left sm:px-3"
              >
                <p className="font-mono text-lg font-semibold tabular-nums text-[var(--landing-fg)] sm:text-xl">
                  {n}
                </p>
                <p className="text-xs text-[var(--landing-muted)]">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={instant ?? { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full flex-1 lg:max-w-[min(100%,560px)]"
          style={{ perspective: reduceMotion ? undefined : 1200 }}
        >
          <motion.div
            className="group/map overflow-hidden rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] shadow-[0_24px_64px_-20px_color-mix(in_oklab,var(--landing-fg)_22%,transparent)]"
            whileHover={
              reduceMotion
                ? undefined
                : {
                    y: -5,
                    rotateX: 2,
                    rotateY: -2,
                    boxShadow:
                      "0 32px 80px -24px color-mix(in oklab, var(--landing-fg) 28%, transparent)",
                    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                  }
            }
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="flex items-center gap-2 border-b border-[var(--landing-border)] bg-[var(--landing-band)] px-3 py-2.5">
              <span className="h-2 w-2 rounded-full bg-[color-mix(in_oklab,var(--landing-muted)_55%,transparent)]" aria-hidden />
              <span className="h-2 w-2 rounded-full bg-[color-mix(in_oklab,var(--landing-muted)_55%,transparent)]" aria-hidden />
              <span className="h-2 w-2 rounded-full bg-[color-mix(in_oklab,var(--landing-muted)_55%,transparent)]" aria-hidden />
              <div className="ml-2 flex-1 truncate rounded-md border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-2.5 py-1 text-[11px] text-[var(--landing-muted)]">
                transitflow.app/map
              </div>
            </div>
            <div className="overflow-hidden bg-[var(--landing-band)]">
              <Image
                src="/landing-page.png"
                alt="TransitFlow interactive map showing GO Transit routes"
                width={1200}
                height={720}
                priority
                quality={92}
                className={[
                  "w-full object-cover object-top transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  reduceMotion ? "" : "group-hover/map:scale-[1.02]",
                ].join(" ")}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
