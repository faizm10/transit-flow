"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type GroupedVariant = {
  route_variant: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number | string;
  directions: Record<
    number,
    {
      variant_id: string;
      duration_label: string;
      start_stop_name: string;
      end_stop_name: string;
    }
  >;
};

export type VariantStops = Record<
  string,
  Array<{
    stop_id: string;
    stop_name: string;
    stop_lat: number | null;
    stop_lon: number | null;
    stop_sequence: number;
  }>
>;

const VARIANT_COLORS = [
  "hsl(142 76% 36%)",
  "hsl(221 83% 53%)",
  "hsl(262 83% 58%)",
  "hsl(25 95% 53%)",
  "hsl(346 77% 50%)",
  "hsl(47 96% 53%)",
  "hsl(173 80% 40%)",
  "hsl(280 67% 58%)",
  "hsl(199 89% 48%)",
  "hsl(330 81% 60%)",
];

function formatRouteType(value: number | string) {
  return String(value) === "2" ? "Train" : "Bus";
}

type VariantLine = {
  routeShortName: string;
  routeType: string;
  routeVariant: string;
  direction: "forward" | "reverse";
  startName: string;
  endName: string;
  durationLabel: string;
  stops: Array<{ stop_id: string; stop_name: string; stop_sequence: number }>;
  color: string;
  dashed: boolean;
};

type RouteRow = {
  routeShortName: string;
  routeType: string;
  routeLongName: string;
  lines: VariantLine[];
};

type RouteGraphProps = {
  grouped: GroupedVariant[];
  variantStops: VariantStops;
  className?: string;
};

export function RouteGraph({
  grouped,
  variantStops,
  className,
}: RouteGraphProps) {
  const routes = useMemo(() => {
    const routeMap = new Map<string, GroupedVariant[]>();
    grouped.forEach((g) => {
      const key = g.route_short_name;
      if (!routeMap.has(key)) routeMap.set(key, []);
      routeMap.get(key)!.push(g);
    });
    const sortedRoutes = Array.from(routeMap.entries()).sort(([a], [b]) => {
      const aNum = /^\d+$/.test(a) ? Number(a) : NaN;
      const bNum = /^\d+$/.test(b) ? Number(b) : NaN;
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
      if (!Number.isNaN(aNum)) return 1;
      if (!Number.isNaN(bNum)) return -1;
      return a.localeCompare(b);
    });

    let colorIdx = 0;
    const rows: RouteRow[] = [];

    sortedRoutes.forEach(([routeShortName, variants]) => {
      const lines: VariantLine[] = [];
      variants.forEach((v) => {
        const forward = v.directions[0];
        const reverse = v.directions[1];
        const forwardStops = forward
          ? (variantStops[forward.variant_id] || []).sort(
              (a, b) => a.stop_sequence - b.stop_sequence
            )
          : [];
        const reverseStops = reverse
          ? (variantStops[reverse.variant_id] || []).sort(
              (a, b) => a.stop_sequence - b.stop_sequence
            )
          : [];

        if (forward && forwardStops.length > 0) {
          lines.push({
            routeShortName,
            routeType: String(v.route_type),
            routeVariant: v.route_variant,
            direction: "forward",
            startName: forward.start_stop_name,
            endName: forward.end_stop_name,
            durationLabel: forward.duration_label,
            stops: forwardStops,
            color: VARIANT_COLORS[colorIdx % VARIANT_COLORS.length],
            dashed: false,
          });
          colorIdx++;
        }
        if (reverse && reverseStops.length > 0) {
          lines.push({
            routeShortName,
            routeType: String(v.route_type),
            routeVariant: v.route_variant,
            direction: "reverse",
            startName: reverse.start_stop_name,
            endName: reverse.end_stop_name,
            durationLabel: reverse.duration_label,
            stops: reverseStops,
            color: VARIANT_COLORS[colorIdx % VARIANT_COLORS.length],
            dashed: true,
          });
          colorIdx++;
        }
      });

      if (lines.length > 0) {
        rows.push({
          routeShortName,
          routeType: String(variants[0]?.route_type ?? ""),
          routeLongName: variants[0]?.route_long_name ?? "",
          lines,
        });
      }
    });

    return rows;
  }, [grouped, variantStops]);

  return (
    <div className={cn("space-y-6", className)}>
      {routes.map((route) => (
        <div
          key={route.routeShortName}
          className="flex flex-col gap-4 rounded-xl border border-dashed bg-muted/10 p-4 lg:flex-row lg:items-stretch"
        >
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex gap-6 pb-2">
              {route.lines.map((line, i) => (
                <VariantTrack
                  key={`${line.routeVariant}-${line.direction}-${i}`}
                  line={line}
                />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-dashed pt-4 lg:w-52 lg:flex-shrink-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
            <p className="text-xs font-semibold">
              Route {route.routeShortName}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatRouteType(route.routeType)}
              {route.routeLongName ? ` · ${route.routeLongName}` : ""}
            </p>
            <div className="mt-1 space-y-1.5">
              {route.lines.map((line, i) => (
                <div
                  key={`${line.routeVariant}-${line.direction}-${i}`}
                  className="flex items-center gap-2 text-[10px]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full border border-background"
                    style={{ backgroundColor: line.color }}
                  />
                  <span>
                    {line.routeVariant}
                    {line.dashed ? " (↔)" : " (→)"} · {line.durationLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VariantTrack({ line }: { line: VariantLine }) {
  const lineStyle = line.dashed
    ? {
        backgroundImage: `repeating-linear-gradient(to bottom, ${line.color} 0px, ${line.color} 4px, transparent 4px, transparent 8px)`,
        opacity: 0.7,
      }
    : { backgroundColor: line.color, opacity: 0.7 };

  return (
    <div className="flex min-w-[140px] shrink-0 flex-col">
      <p className="mb-1 truncate text-[10px] font-medium text-foreground" title={`${line.startName} → ${line.endName}`}>
        {line.routeVariant}{line.dashed ? " ↔" : " →"}
      </p>
      <p className="mb-2 text-[10px] text-muted-foreground">{line.durationLabel}</p>
      <div className="relative flex flex-col">
        <div
          className="absolute left-[6px] top-3 bottom-3 w-0.5 -translate-x-1/2 rounded-full"
          style={lineStyle}
        />
        {line.stops.map((stop) => (
          <div
            key={stop.stop_id}
            className="relative z-10 flex min-h-[28px] items-center gap-2 py-0.5 first:pt-0 last:pb-0"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border-2 border-background"
              style={{ backgroundColor: line.color }}
            />
            <span
              className="truncate text-[10px] text-muted-foreground max-w-[120px]"
              title={stop.stop_name || stop.stop_id}
            >
              {stop.stop_name || stop.stop_id}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
