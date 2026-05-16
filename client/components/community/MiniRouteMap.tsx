"use client";

import type { CustomRoute, CustomStop } from "@/lib/gtfs";

interface MiniRouteMapProps {
  route: CustomRoute;
  className?: string;
}

function projectStops(stops: CustomStop[], width: number, height: number) {
  if (stops.length === 0) return [];
  const lons = stops.map((s) => s.lon);
  const lats = stops.map((s) => s.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const pad = 12;
  const rangeX = maxLon - minLon || 0.01;
  const rangeY = maxLat - minLat || 0.01;

  return stops.map((s) => ({
    x: pad + ((s.lon - minLon) / rangeX) * (width - pad * 2),
    // Flip Y: higher lat = higher on screen
    y: height - pad - ((s.lat - minLat) / rangeY) * (height - pad * 2),
    name: s.name,
  }));
}

function projectGeometry(
  geometry: [number, number][],
  width: number,
  height: number
) {
  if (geometry.length === 0) return "";
  const lons = geometry.map(([lon]) => lon);
  const lats = geometry.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const pad = 12;
  const rangeX = maxLon - minLon || 0.01;
  const rangeY = maxLat - minLat || 0.01;

  return geometry
    .map(([lon, lat], i) => {
      const x = pad + ((lon - minLon) / rangeX) * (width - pad * 2);
      const y = height - pad - ((lat - minLat) / rangeY) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function MiniRouteMap({ route, className = "" }: MiniRouteMapProps) {
  const W = 280;
  const H = 160;
  const color = route.color ?? "#3b82f6";

  const hasGeometry = Array.isArray(route.geometry) && route.geometry.length > 1;
  const hasStops = Array.isArray(route.stops) && route.stops.length > 0;

  if (!hasGeometry && !hasStops) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-[var(--landing-band)] text-xs text-[var(--landing-muted)] ${className}`}
        style={{ height: H }}
      >
        No geometry
      </div>
    );
  }

  const pathD = hasGeometry
    ? projectGeometry(route.geometry!, W, H)
    : "";

  const projectedStops = hasStops ? projectStops(route.stops, W, H) : [];

  // If no geometry but stops exist, draw a polyline through stop positions
  const stopPolyline =
    !hasGeometry && projectedStops.length > 1
      ? projectedStops
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ")
      : "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      className={`rounded-xl bg-[var(--landing-band)] ${className}`}
      aria-label={`Map preview for ${route.name}`}
      role="img"
    >
      {/* Route line */}
      {(pathD || stopPolyline) && (
        <path
          d={pathD || stopPolyline}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.85}
        />
      )}

      {/* Stop dots */}
      {projectedStops.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 || i === projectedStops.length - 1 ? 4 : 2.5}
          fill={color}
          stroke="white"
          strokeWidth={1}
          opacity={0.9}
        />
      ))}
    </svg>
  );
}
