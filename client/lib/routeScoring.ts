export type ScoringDimension = {
  label: string;
  score: number; // 0-100
  weight: number;
};

export type RouteScore = {
  overall: number; // 0-100 weighted average
  grade: "A" | "B" | "C" | "D" | "F";
  dimensions: {
    frequency: ScoringDimension;
    coverage: ScoringDimension;
    connectivity: ScoringDimension;
    efficiency: ScoringDimension;
  };
};

type LatLng = { lat: number; lng: number };

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type ScoreInputs = {
  stops: LatLng[];
  intervalMinutes?: number; // from ScheduleFrequency
  routeDistanceKm?: number; // Mapbox Directions result.distance / 1000
  goTransitStopsNearby?: number; // GO stops within 500m of any route stop
  totalGoStopsInCorridor?: number; // total GO stops within corridor bbox
};

export function computeRouteScore(inputs: ScoreInputs): RouteScore {
  const {
    stops,
    intervalMinutes,
    routeDistanceKm,
    goTransitStopsNearby,
    totalGoStopsInCorridor,
  } = inputs;

  // Frequency Score (25%): shorter headway = better
  const freqScore =
    intervalMinutes != null
      ? Math.max(0, Math.min(100, 100 - intervalMinutes * 2))
      : 0;

  // Coverage Score (25%): more stops = wider coverage
  const coverageScore = Math.min(100, stops.length * 10);

  // Connectivity Score (25%): GO stops within 500m / total GO stops in corridor
  const connectivityScore =
    totalGoStopsInCorridor && totalGoStopsInCorridor > 0
      ? Math.min(
          100,
          (((goTransitStopsNearby ?? 0) / totalGoStopsInCorridor) * 100)
        )
      : 0;

  // Efficiency Score (25%): straight-line vs actual distance
  let efficiencyScore = 0;
  if (stops.length >= 2 && routeDistanceKm && routeDistanceKm > 0) {
    const start = stops[0];
    const end = stops[stops.length - 1];
    const straightLineKm = haversineKm(start, end);
    const ratio = straightLineKm / routeDistanceKm;
    efficiencyScore = Math.min(100, Math.round(ratio * 100));
  }

  const overall = Math.round(
    freqScore * 0.25 +
      coverageScore * 0.25 +
      connectivityScore * 0.25 +
      efficiencyScore * 0.25
  );

  const grade: RouteScore["grade"] =
    overall >= 90
      ? "A"
      : overall >= 75
        ? "B"
        : overall >= 60
          ? "C"
          : overall >= 45
            ? "D"
            : "F";

  return {
    overall,
    grade,
    dimensions: {
      frequency: { label: "Frequency", score: freqScore, weight: 0.25 },
      coverage: { label: "Coverage", score: coverageScore, weight: 0.25 },
      connectivity: {
        label: "Connectivity",
        score: connectivityScore,
        weight: 0.25,
      },
      efficiency: { label: "Efficiency", score: efficiencyScore, weight: 0.25 },
    },
  };
}
