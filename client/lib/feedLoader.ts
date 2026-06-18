/**
 * Feed abstraction — reads derived GTFS files from either:
 *   - Local filesystem (GO Transit: public/gotransit/derived/)
 *   - Vercel Blob (uploaded city feeds, stored by the GTFS processor)
 *
 * All API routes use this instead of hardcoded PUBLIC_DIR constants.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const GO_DERIVED_DIR = join(process.cwd(), "public", "gotransit", "derived");
const GO_DERIVED_PUBLIC_PATH = "/gotransit/derived";

export type FeedSource =
  | { type: "local"; dir: string; publicPath: string }
  | { type: "blob"; blobBaseUrl: string };

/** Resolve a feedId to a FeedSource.
 *  "gotransit" / null / undefined → local filesystem
 *  UUID string → look up blobBaseUrl from DB
 */
export async function resolveFeedSource(
  feedId: string | null | undefined,
): Promise<FeedSource> {
  if (!feedId || feedId === "gotransit") {
    return { type: "local", dir: GO_DERIVED_DIR, publicPath: GO_DERIVED_PUBLIC_PATH };
  }

  const rows = await db
    .select({ blobBaseUrl: gtfsFeeds.blobBaseUrl, status: gtfsFeeds.status })
    .from(gtfsFeeds)
    .where(eq(gtfsFeeds.id, feedId))
    .limit(1);

  const feed = rows[0];
  if (!feed) throw new Error(`Feed not found: ${feedId}`);
  if (feed.status !== "ready") throw new Error(`Feed not ready: ${feedId} (status: ${feed.status})`);
  if (!feed.blobBaseUrl) throw new Error(`Feed has no blob URL: ${feedId}`);

  return { type: "blob", blobBaseUrl: feed.blobBaseUrl };
}

/** Read a derived file as a UTF-8 string. */
export async function readDerivedFile(
  source: FeedSource,
  filename: string,
): Promise<string> {
  if (source.type === "local") {
    return readFileSync(join(source.dir, filename), "utf-8");
  }
  const url = `${source.blobBaseUrl}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blob fetch failed (${res.status}): ${url}`);
  return res.text();
}

/** Get a URL suitable for Mapbox setData() or direct browser fetching. */
export function getDerivedFileUrl(source: FeedSource, filename: string): string {
  if (source.type === "local") return `${source.publicPath}/${filename}`;
  return `${source.blobBaseUrl}/${filename}`;
}
