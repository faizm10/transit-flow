/**
 * Mapbox Directions API v5 client.
 * GET https://api.mapbox.com/directions/v5/{profile}/{coordinates}
 * Uses geometries=geojson and overview=full for route geometry.
 */

export type DirectionsProfile = "mapbox/driving" | "mapbox/walking" | "mapbox/cycling";

export type DirectionsResult = {
  geometry: GeoJSON.LineString;
  distance: number; // meters
  duration: number; // seconds (total)
  /** Duration of each leg in seconds (stop i to stop i+1). Enables accurate simulation timing. */
  legDurations: number[];
};

export type DirectionsErrorCode =
  | "NoRoute"
  | "NoSegment"
  | "InvalidInput"
  | "TokenError"
  | "NetworkError"
  | "Unknown";

export type DirectionsError = {
  code: DirectionsErrorCode;
  message: string;
};

function buildCoordinatesString(stops: Array<{ lng: number; lat: number }>): string {
  return stops.map((s) => `${s.lng},${s.lat}`).join(";");
}

/**
 * Fetch route from Mapbox Directions API v5.
 * Requires 2-25 waypoints. Uses AbortController for cancellation.
 */
export async function fetchDirections(
  stops: Array<{ lng: number; lat: number }>,
  profile: DirectionsProfile,
  accessToken: string,
  signal?: AbortSignal
): Promise<{ ok: true; data: DirectionsResult } | { ok: false; error: DirectionsError }> {
  if (stops.length < 2) {
    return {
      ok: false,
      error: { code: "InvalidInput", message: "At least 2 stops required" },
    };
  }
  if (stops.length > 25) {
    return {
      ok: false,
      error: { code: "InvalidInput", message: "Maximum 25 stops allowed" },
    };
  }

  const coords = buildCoordinatesString(stops);
  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: "geojson",
    overview: "full",
    alternatives: "false",
  });

  const url = `https://api.mapbox.com/directions/v5/${profile}/${encodeURIComponent(coords)}?${params.toString()}`;

  try {
    const res = await fetch(url, { signal });
    const json = (await res.json()) as {
      routes?: Array<{
        geometry?: { coordinates: [number, number][] };
        distance?: number;
        duration?: number;
        legs?: Array<{ duration?: number; distance?: number }>;
      }>;
      code?: string;
      message?: string;
    };

    if (!res.ok) {
      const code = (json.code || "TokenError") as DirectionsErrorCode;
      return {
        ok: false,
        error: {
          code: ["NoRoute", "NoSegment", "InvalidInput"].includes(json.code || "")
            ? (json.code as DirectionsErrorCode)
            : "TokenError",
          message: json.message || `HTTP ${res.status}`,
        },
      };
    }

    if (!json.routes || json.routes.length === 0) {
      return {
        ok: false,
        error: {
          code: "NoRoute",
          message: json.message || "No route found for these stops.",
        },
      };
    }

    const route = json.routes[0];
    const coordsRoute = route.geometry?.coordinates;
    if (!coordsRoute || coordsRoute.length < 2) {
      return {
        ok: false,
        error: {
          code: "NoRoute",
          message: "Route geometry missing or invalid.",
        },
      };
    }

    const legs = route.legs ?? [];
    const legDurations = legs
      .map((leg) => leg.duration ?? 0)
      .filter((d) => d >= 0);
    const totalDuration = route.duration ?? legDurations.reduce((a, b) => a + b, 0);

    return {
      ok: true,
      data: {
        geometry: {
          type: "LineString",
          coordinates: coordsRoute,
        },
        distance: route.distance ?? 0,
        duration: totalDuration,
        legDurations: legDurations.length > 0 ? legDurations : [totalDuration],
      },
    };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw err; // Let caller handle abort
      }
      return {
        ok: false,
        error: {
          code: "NetworkError",
          message: err.message,
        },
      };
    }
    return {
      ok: false,
      error: { code: "Unknown", message: "An unknown error occurred" },
    };
  }
}
