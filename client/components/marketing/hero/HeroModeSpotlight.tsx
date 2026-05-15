"use client";

import { useCallback, useId, useRef, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type HeroModeId = "explore" | "design" | "simulate" | "schedules";

const MODES: readonly {
  id: HeroModeId;
  label: string;
  body: string;
}[] = [
  {
    id: "explore",
    label: "Explore",
    body: "Pan the live network — every GO line, stop, and frequency layer on one canvas.",
  },
  {
    id: "design",
    label: "Design",
    body: "Sketch corridors, drop stops, and dial headways without leaving the map.",
  },
  {
    id: "simulate",
    label: "Simulate",
    body: "Run vehicles through the day and scrub time to stress-test your layout.",
  },
  {
    id: "schedules",
    label: "Schedules",
    body: "Open any route and compare headways and timetables side by side.",
  },
] as const;

type Props = {
  active: HeroModeId;
  onChange: (id: HeroModeId) => void;
  reduceMotion: boolean;
};

export function HeroModeSpotlight({ active, onChange, reduceMotion }: Props) {
  const labelId = useId();
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = MODES.findIndex((m) => m.id === active);

  const focusTab = useCallback((index: number) => {
    const len = MODES.length;
    const i = ((index % len) + len) % len;
    tabsRef.current[i]?.focus();
    onChange(MODES[i].id);
  }, [onChange]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        focusTab(activeIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        focusTab(activeIndex - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusTab(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusTab(MODES.length - 1);
      }
    },
    [activeIndex, focusTab],
  );

  const activeBody = MODES.find((m) => m.id === active)?.body ?? MODES[0].body;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p id={labelId} className="sr-only">
          Choose a map mode. The description below updates.
        </p>
        <div
          role="tablist"
          aria-labelledby={labelId}
          onKeyDown={onKeyDown}
          className="flex flex-wrap gap-2"
        >
          {MODES.map((mode, i) => {
            const selected = mode.id === active;
            return (
              <button
                key={mode.id}
                ref={(el) => {
                  tabsRef.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`hero-tab-${mode.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(mode.id)}
                className={[
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-[background-color,border-color,color,box-shadow]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]",
                  selected
                    ? "border-[color-mix(in_oklab,var(--landing-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--landing-accent)_16%,transparent)] text-[var(--landing-fg)] shadow-[0_1px_0_color-mix(in_oklab,var(--landing-accent)_25%,transparent)]"
                    : "border-[var(--landing-border)] bg-[var(--landing-band)] text-[var(--landing-muted)] hover:border-[color-mix(in_oklab,var(--landing-fg)_14%,var(--landing-border))] hover:bg-[color-mix(in_oklab,var(--landing-elevated)_70%,var(--landing-band))] hover:text-[var(--landing-fg)]",
                ].join(" ")}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`hero-tab-${active}`}
        className="min-h-[4.5rem] text-base leading-relaxed text-[var(--landing-muted)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={active}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            }
          >
            {activeBody}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
