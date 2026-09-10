import Link from "next/link";
import { GO_RAIL_LINES } from "@/lib/routeColors";

const LINES = Object.entries(GO_RAIL_LINES);

const BASE =
  "inline-flex items-center px-3 py-1.5 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] transition-colors";
const INACTIVE = `${BASE} border border-[var(--landing-border)] text-[var(--landing-muted)] hover:border-[var(--landing-border-2)] hover:text-[var(--landing-ink)]`;

export function LineFilterBar({ activeLine }: { activeLine?: string }) {
  const active = activeLine?.toUpperCase();

  return (
    <div className="mb-10 flex flex-wrap gap-2">
      <Link
        href="/service-updates"
        className={
          !active
            ? `${BASE} bg-[var(--landing-accent)] text-white`
            : INACTIVE
        }
      >
        All lines
      </Link>

      {LINES.map(([code, info]) => {
        const isActive = active === code;
        return (
          <Link
            key={code}
            href={`/service-updates?line=${code}`}
            className={isActive ? BASE : INACTIVE}
            style={
              isActive
                ? { backgroundColor: info.color, color: info.textColor }
                : undefined
            }
          >
            {info.name.replace(" Line", "")}
          </Link>
        );
      })}
    </div>
  );
}
