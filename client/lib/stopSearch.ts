/**
 * Performant stop search from stops.txt
 * Returns top 5 closest results based on geographic proximity
 */

export type GTFSStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string;
  stop_url?: string;
};

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Parse stops.txt content (streaming or in chunks)
 * Returns array of parsed stops
 */
export function parseStopsTxt(content: string): GTFSStop[] {
  const lines = content.split('\n');
  const stops: GTFSStop[] = [];

  if (lines.length === 0) return stops;

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < 4) continue;

    const stop_id = parts[0];
    const stop_name = parts[1];
    const stop_lat = parseFloat(parts[2]);
    const stop_lon = parseFloat(parts[3]);

    if (isNaN(stop_lat) || isNaN(stop_lon)) continue;

    stops.push({
      stop_id,
      stop_name,
      stop_lat,
      stop_lon,
      zone_id: parts[4],
      stop_url: parts[5],
    });
  }

  return stops;
}

/**
 * Search for stops near a given location
 * Returns top 5 closest results, optionally filtered by name
 */
export function searchStops(
  stops: GTFSStop[],
  centerLat: number,
  centerLon: number,
  nameQuery?: string,
  maxResults: number = 5
): GTFSStop[] {
  const normalizedQuery = nameQuery?.trim().toLowerCase();

  // Calculate distances for all stops
  const stopsWithDistance = stops.map((stop) => ({
    stop,
    distance: haversineKm(centerLat, centerLon, stop.stop_lat, stop.stop_lon),
    nameMatch: normalizedQuery
      ? stop.stop_name.toLowerCase().includes(normalizedQuery)
      : true,
  }));

  // Filter by name if provided
  const filtered = normalizedQuery
    ? stopsWithDistance.filter((s) => s.nameMatch)
    : stopsWithDistance;

  // Sort by distance (closest first)
  filtered.sort((a, b) => {
    // Prioritize name matches if query provided
    if (normalizedQuery) {
      const aExact = a.stop.stop_name.toLowerCase().startsWith(normalizedQuery);
      const bExact = b.stop.stop_name.toLowerCase().startsWith(normalizedQuery);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
    }
    return a.distance - b.distance;
  });

  // Return top N results
  return filtered.slice(0, maxResults).map((s) => s.stop);
}

/**
 * Load stops from public stops.txt file
 * Uses fetch API to load the file
 */
export async function loadGOTransitStops(): Promise<GTFSStop[]> {
  try {
    const response = await fetch('/gotransit/stops.txt');
    if (!response.ok) {
      throw new Error(`Failed to load stops.txt: ${response.status}`);
    }
    const content = await response.text();
    return parseStopsTxt(content);
  } catch (error) {
    console.error('Error loading GO Transit stops:', error);
    return [];
  }
}
