"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
function severityLabel(type: AlertType): { label: string; className: string } | null {
  switch (type) {
    case "delay":
      return { label: "Delay", className: "text-amber-600" };
    case "cancellation":
      return { label: "Cancelled", className: "text-red-600" };
    default:
      return null;
  }
}

const BODY_CLAMP_LENGTH = 180;

export function AlertCard({ alert }: { alert: ServiceAlert }) {
  const [expanded, setExpanded] = useState(false);

  const sev = severityLabel(alert.type);
  const lines = alert.routes.map((code) => GO_RAIL_LINES[code]).filter(Boolean);
  const primary = lines[0];
  const mapRoute = alert.routes[0];

  const isLong = alert.body.length > BODY_CLAMP_LENGTH;
  const displayBody =
    isLong && !expanded
      ? alert.body.slice(0, BODY_CLAMP_LENGTH).trimEnd() + "…"
      : alert.body;

  return (
    <article className="rounded-xl border border-gray-100 bg-white p-5 transition-colors hover:border-gray-200">
      {/* Meta: which line · severity · when */}
      <div className="flex items-center gap-2 text-xs">
        {primary ? (
          <span className="flex items-center gap-1.5 font-medium text-gray-500">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: primary.color }}
            />
            {primary.name.replace(" Line", "")}
            {lines.length > 1 && (
              <span className="text-gray-400">+{lines.length - 1}</span>
            )}
          </span>
        ) : (
          <span className="font-medium text-gray-400">GO Transit</span>
        )}

        {sev && (
          <span className={`font-semibold ${sev.className}`}>{sev.label}</span>
        )}

        {alert.postedAt && (
          <time dateTime={alert.postedAt} className="ml-auto shrink-0 text-gray-400">
            {formatDate(alert.postedAt)}
          </time>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-2.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-gray-900">
        {alert.title}
      </h3>

      {/* Body */}
      {alert.body && (
        <p className="mt-1.5 whitespace-pre-line text-sm leading-[1.65] text-gray-600">
          {displayBody}
          {isLong && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="ml-1 font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
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
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#007A33] hover:text-[#005c26]"
        >
          View on map
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </article>
  );
}
