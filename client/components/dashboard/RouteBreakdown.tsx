import { Bus, Train } from "lucide-react";

interface Props {
  breakdown: Record<string, number>;
}

export function RouteBreakdown({ breakdown }: Props) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
  const bus   = breakdown["bus"]   ?? 0;
  const train = breakdown["train"] ?? 0;
  const busPct   = Math.round((bus   / total) * 100);
  const trainPct = Math.round((train / total) * 100);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-gray-900">Route types</h2>

      <div className="mt-5 space-y-4">
        {[
          { label: "Bus", count: bus, pct: busPct, color: "#e53e3e", icon: Bus },
          { label: "Train", count: train, pct: trainPct, color: "#007A33", icon: Train },
        ].map(({ label, count, pct, color, icon: Icon }) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <Icon className="h-3.5 w-3.5" style={{ color }} />
                {label}
              </span>
              <span className="text-gray-500">
                {count.toLocaleString()} <span className="text-gray-300">·</span> {pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
