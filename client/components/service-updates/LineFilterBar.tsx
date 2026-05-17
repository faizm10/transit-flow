import Link from "next/link";
import { GO_RAIL_LINES } from "@/lib/routeColors";

const LINES = Object.entries(GO_RAIL_LINES);

const INACTIVE =
  "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors";

export function LineFilterBar({ activeLine }: { activeLine?: string }) {
  const active = activeLine?.toUpperCase();

  return (
    <div className="flex flex-wrap gap-2 mb-8">
      <Link
        href="/service-updates"
        className={
          !active
            ? "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium bg-[#007A33] text-white transition-colors"
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
            className={
              isActive
                ? "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors"
                : INACTIVE
            }
            style={isActive ? { backgroundColor: info.color, color: info.textColor } : undefined}
          >
            {info.name.replace(" Line", "")}
          </Link>
        );
      })}
    </div>
  );
}
