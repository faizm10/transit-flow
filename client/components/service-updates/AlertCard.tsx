import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GO_RAIL_LINES } from "@/lib/routeColors";
import type { ServiceAlert, AlertType } from "@/lib/serviceUpdates";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function severityStyle(type: AlertType): { bg: string; text: string; dot: string; label: string } {
  switch (type) {
    case "delay":
      return { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", label: "Delay" };
    case "cancellation":
      return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-600", label: "Cancelled" };
    case "information":
      return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Notice" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400", label: "Update" };
  }
}

export function AlertCard({ alert }: { alert: ServiceAlert }) {
  const sev = severityStyle(alert.type);
  const mapRoute = alert.routes[0];

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-col gap-3 shadow-sm">
      {/* Top row: badges + time */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Route badges */}
        {alert.routes.map((code) => {
          const line = GO_RAIL_LINES[code];
          if (!line) return null;
          return (
            <span
              key={code}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: line.color, color: line.textColor }}
            >
              {code}
            </span>
          );
        })}

        {/* Severity badge */}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${sev.bg} ${sev.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
          {sev.label}
        </span>

        {/* Time */}
        {alert.postedAt && (
          <time dateTime={alert.postedAt} className="ml-auto text-xs text-gray-400 shrink-0">
            {formatDate(alert.postedAt)}
          </time>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-900 leading-snug">
        {alert.title}
      </h3>

      {/* Body */}
      {alert.body && (
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">
          {alert.body}
        </p>
      )}

      {/* Footer: view on map */}
      {mapRoute && (
        <div className="mt-1 flex justify-end">
          <Link
            href={`/map?mode=browse&goRoute=${mapRoute}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#007A33] hover:text-[#005c26] transition-colors"
          >
            View on map
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </article>
  );
}
