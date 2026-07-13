/**
 * Browser-local feed ownership — sign-in is currently disabled for GTFS
 * uploads, so "your feeds" are the feed IDs remembered in this browser's
 * localStorage. The feeds API is queried with these IDs explicitly.
 */

const KEY = "tf_my_feed_ids";

export function getLocalFeedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addLocalFeedId(id: string): void {
  const ids = getLocalFeedIds();
  if (ids.includes(id)) return;
  try { localStorage.setItem(KEY, JSON.stringify([...ids, id])); } catch { /* ignore */ }
}

export function removeLocalFeedId(id: string): void {
  const ids = getLocalFeedIds().filter(x => x !== id);
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

/** URL for the feeds API including this browser's feed IDs. */
export function myFeedsUrl(): string {
  const ids = getLocalFeedIds();
  return ids.length ? `/api/gtfs/feeds?ids=${ids.join(",")}` : "/api/gtfs/feeds";
}
