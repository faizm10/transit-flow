/** Assumed average speed for custom (non–graph-snapped) train polylines, km/h */
export const CUSTOM_TRAIN_ASSUMED_SPEED_KMH = 72;

/**
 * Rough travel time from path length. Used for custom-drawn train lines only
 * (not tied to real track infrastructure).
 */
export function estimateTrainTravelSecsForPathLengthMeters(
  distanceM: number,
  speedKmh = CUSTOM_TRAIN_ASSUMED_SPEED_KMH
): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  const hours = (distanceM / 1000) / speedKmh;
  return Math.max(120, Math.round(hours * 3600));
}
