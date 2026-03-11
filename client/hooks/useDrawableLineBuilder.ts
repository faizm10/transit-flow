import { useState, useCallback, useRef } from "react";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { snapStopsToLine, type StopCandidate } from "@/lib/drawableLineUtils";

export type DrawnStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export function useDrawableLineBuilder() {
  const [isDrawing, setIsDrawing] = useState(false);
  const allGoStopsRef = useRef<StopCandidate[]>([]);

  // Load GO stops from variant_stops.json (called once on demand)
  const loadGoStops = useCallback(async (): Promise<StopCandidate[]> => {
    if (allGoStopsRef.current.length > 0) return allGoStopsRef.current;
    try {
      const res = await fetch("/gotransit/derived/variant_stops.json");
      if (!res.ok) throw new Error("Failed to load GO stops");
      const data = (await res.json()) as Record<
        string,
        Array<{
          stop_id: string;
          stop_name: string;
          stop_lat: number;
          stop_lon: number;
        }>
      >;
      // Deduplicate by stop_id
      const seen = new Set<string>();
      const stops: StopCandidate[] = [];
      for (const variantStops of Object.values(data)) {
        for (const s of variantStops) {
          if (!seen.has(s.stop_id)) {
            seen.add(s.stop_id);
            stops.push({
              id: s.stop_id,
              name: s.stop_name,
              lat: s.stop_lat,
              lng: s.stop_lon,
            });
          }
        }
      }
      allGoStopsRef.current = stops;
      return stops;
    } catch (err) {
      console.error("useDrawableLineBuilder: failed to load GO stops", err);
      return [];
    }
  }, []);

  const startDraw = useCallback(
    (drawRef: React.RefObject<MapboxDraw | null>) => {
      if (!drawRef.current) return;
      drawRef.current.deleteAll();
      drawRef.current.changeMode("draw_line_string");
      setIsDrawing(true);
    },
    []
  );

  const cancelDraw = useCallback(
    (drawRef: React.RefObject<MapboxDraw | null>) => {
      if (!drawRef.current) return;
      drawRef.current.deleteAll();
      drawRef.current.changeMode("simple_select");
      setIsDrawing(false);
    },
    []
  );

  /**
   * Call this when MapboxDraw fires the "draw.create" event.
   * Returns snapped stops sorted by position along the drawn line.
   */
  const handleDrawCreate = useCallback(
    async (
      event: { features: GeoJSON.Feature[] },
      snapDistKm = 0.5
    ): Promise<DrawnStop[]> => {
      setIsDrawing(false);

      const feature = event.features[0];
      if (
        !feature ||
        feature.geometry.type !== "LineString"
      ) {
        return [];
      }

      const coords = feature.geometry.coordinates as [number, number][];
      if (coords.length < 2) return [];

      const goStops = await loadGoStops();
      const snapped = snapStopsToLine(coords, goStops, snapDistKm);

      return snapped.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
      }));
    },
    [loadGoStops]
  );

  return { isDrawing, startDraw, cancelDraw, handleDrawCreate };
}
