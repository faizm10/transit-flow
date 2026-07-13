/**
 * Small per-instance cache for parsed feed data used by the API routes.
 *
 * "gotransit" is pinned — it ships with the app and is the hot path.
 * City feeds get a TTL + LRU cap so deleted feeds age out on warm serverless
 * instances (a DELETE on one instance can't evict another instance's memory)
 * and the maps stay bounded however many feeds are uploaded.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_CITY_ENTRIES = 6;

export class FeedCache<T> {
  private map = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private maxCityEntries = DEFAULT_MAX_CITY_ENTRIES,
    private ttlMs = DEFAULT_TTL_MS,
  ) {}

  get(feedId: string): T | undefined {
    const entry = this.map.get(feedId);
    if (!entry) return undefined;
    if (feedId !== "gotransit" && Date.now() > entry.expiresAt) {
      this.map.delete(feedId);
      return undefined;
    }
    // Re-insert to mark as most recently used
    this.map.delete(feedId);
    this.map.set(feedId, entry);
    return entry.value;
  }

  has(feedId: string): boolean {
    return this.get(feedId) !== undefined;
  }

  set(feedId: string, value: T): void {
    this.map.delete(feedId);
    this.map.set(feedId, { value, expiresAt: Date.now() + this.ttlMs });

    let cityCount = 0;
    for (const key of this.map.keys()) {
      if (key !== "gotransit") cityCount++;
    }
    if (cityCount > this.maxCityEntries) {
      // Map iteration order is insertion order → first non-pinned key is LRU
      for (const key of this.map.keys()) {
        if (key !== "gotransit") {
          this.map.delete(key);
          break;
        }
      }
    }
  }

  delete(feedId: string): void {
    this.map.delete(feedId);
  }
}
