"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQ = [
  {
    q: "Do I need an account?",
    a: "No. Open the map and the GO Transit network loads in your browser — no sign-up or install.",
  },
  {
    q: "What data does TransitFlow use?",
    a: "Public GO Transit GTFS: routes, stops, shapes, and schedules. It is read-only against the live feed for exploration and design experiments.",
  },
  {
    q: "Can I save my designs?",
    a: "You can work in-session on the canvas. For durable saves or exports, check the map app for what is supported in your browser.",
  },
  {
    q: "Is this affiliated with Metrolinx or GO Transit?",
    a: "TransitFlow is an independent project. GO Transit and Metrolinx are trademarks of their respective owners.",
  },
] as const;

export default function MarketingFaq() {
  const [open, setOpen] = useState<number | null>(0);
  const headingId = useId();

  return (
    <section
      className="border-b border-[var(--landing-border)] bg-[var(--landing-bg)] py-16 sm:py-24"
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-2xl px-5 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--landing-accent)]">
          FAQ
        </p>
        <h2
          id={headingId}
          className="mt-2 text-3xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-4xl"
        >
          Questions, answered.
        </h2>

        <div className="mt-10 divide-y divide-[var(--landing-border)] border-t border-[var(--landing-border)]">
          {FAQ.map((item, i) => {
            const expanded = open === i;
            const panelId = `faq-panel-${i}`;
            const buttonId = `faq-button-${i}`;
            return (
              <div key={item.q} className="border-b border-[var(--landing-border)]">
                <h3 className="text-base font-medium text-[var(--landing-fg)]">
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="flex w-full items-start justify-between gap-4 py-5 text-left outline-none transition-colors hover:text-[color-mix(in_oklab,var(--landing-fg)_85%,var(--landing-muted))] focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--landing-bg)]"
                    onClick={() => setOpen(expanded ? null : i)}
                  >
                    <span className="min-w-0 flex-1 pr-2">{item.q}</span>
                    <ChevronDown
                      className={`mt-0.5 h-5 w-5 shrink-0 text-[var(--landing-muted)] transition-transform duration-200 ${
                        expanded ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!expanded}
                  className="pb-5"
                >
                  <p className="text-sm leading-relaxed text-[var(--landing-muted)]">{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
