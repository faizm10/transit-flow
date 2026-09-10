"use client";

import Link from "next/link";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import type { ServiceAlert, AlertType } from "@/lib/serviceUpdates";
import { useState } from "react";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Only delays and cancellations get a word — notices are self-evident in context. */
function severity(
  type: AlertType,
): { label: string; color: string } | null {
  switch (type) {
    case "delay":
      return { label: "Delay", color: "var(--landing-amber)" };
    case "cancellation":
      return { label: "Cancelled", color: "var(--landing-red)" };
    default:
      return null;
  }
}

const BODY_CLAMP_LENGTH = 180;

export function AlertCard({ alert }: { alert: ServiceAlert }) {
  const [expanded, setExpanded] = useState(false);

  const sev = severity(alert.type);
  const lines = alert.routes.map((code) => GO_RAIL_LINES[code]).filter(Boolean);
  const primary = lines[0];
  const mapRoute = alert.routes[0];

  const isLong = alert.body.length > BODY_CLAMP_LENGTH;
  const displayBody =
    isLong && !expanded
      ? alert.body.slice(0, BODY_CLAMP_LENGTH).trimEnd() + "…"
      : alert.body;

  return (
    <article className="border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-5 transition-colors hover:border-[var(--landing-border-2)]">
      {/* Severity stripe as a small square — state reads at a glance */}
      <div className="flex items-center gap-2 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.05em]">
        {sev && (
          <span
            className="h-2 w-2 shrink-0"
            style={{ backgroundColor: sev.color }}
            aria-hidden
          />
        )}
        {primary ? (
          <span className="flex items-center gap-1.5 text-[var(--landing-muted)]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: primary.color }}
            />
            {primary.name.replace(" Line", "")}
            {lines.length > 1 && (
              <span className="text-[var(--landing-faint)]">
                +{lines.length - 1}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--landing-faint)]">GO Transit</span>
        )}

        {sev && (
          <span style={{ color: sev.color }} className="font-medium">
            {sev.label}
          </span>
        )}

        {alert.postedAt && (
          <time
            dateTime={alert.postedAt}
            className="ml-auto shrink-0 text-[var(--landing-faint)]"
          >
            {formatDate(alert.postedAt)}
          </time>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-3 font-[family-name:var(--font-hanken)] text-[1.0625rem] font-medium leading-snug tracking-[-0.01em] text-[var(--landing-ink)]">
        {alert.title}
      </h3>

      {/* Body */}
      {alert.body && (
        <p className="mt-1.5 whitespace-pre-line text-sm leading-[1.65] text-[var(--landing-muted)]">
          {displayBody}
          {isLong && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="ml-1 font-medium text-[var(--landing-fg)] underline decoration-[var(--landing-border-2)] underline-offset-2 hover:text-[var(--landing-ink)]"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </p>
      )}

      {/* Action */}
      {mapRoute && (
        <Link
          href={`/map?mode=browse&goRoute=${mapRoute}`}
          className="mt-3.5 inline-flex items-center gap-1 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--landing-accent)] transition-opacity hover:opacity-70"
        >
          View on map →
        </Link>
      )}
    </article>
  );
}
