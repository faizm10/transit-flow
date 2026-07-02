import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processGtfsFeed } from "@/lib/gtfsProcessor";
import { gtfsProcessSecret } from "@/lib/gtfsProcessSecret";
import { del } from "@vercel/blob";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Verify internal secret — no fallback in production
  const expected = gtfsProcessSecret();
  if (!expected) {
    console.error("[gtfs/process] GTFS_PROCESS_SECRET is not configured");
    return NextResponse.json({ error: "Processing is not configured" }, { status: 503 });
  }
  if (req.headers.get("x-gtfs-secret") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let feedId: string | undefined;
  let zipUrl: string | undefined;
  try {
    const body = await req.json() as { feedId?: string; blobUrl?: string };
    feedId = body.feedId;
    zipUrl = body.blobUrl;
    if (!feedId || !zipUrl) {
      return NextResponse.json({ error: "Missing feedId or blobUrl" }, { status: 400 });
    }

    const zipRes = await fetch(zipUrl);
    if (!zipRes.ok) throw new Error(`Failed to fetch ZIP: ${zipRes.status}`);
    const zipBuffer = await zipRes.arrayBuffer();

    // Process the feed
    const result = await processGtfsFeed(zipBuffer, feedId, (msg) => {
      console.log(`[gtfs/process ${feedId}] ${msg}`);
    });

    // Update DB to ready
    await db
      .update(gtfsFeeds)
      .set({
        status:      "ready",
        blobBaseUrl: result.blobBaseUrl,
        routeCount:  result.routeCount,
        stopCount:   result.stopCount,
      })
      .where(eq(gtfsFeeds.id, feedId));

    // The raw ZIP is only needed for processing — delete it so it doesn't
    // accumulate in Blob storage (it lives at feeds/raw/*, outside the
    // feeds/<id>/ prefix the feed-delete handler cleans up).
    await del(zipUrl).catch((err) => {
      console.error(`[gtfs/process ${feedId}] raw ZIP cleanup failed:`, err);
    });

    return NextResponse.json({ feedId, status: "ready", ...result });
  } catch (err) {
    console.error("[gtfs/process] error:", err);
    // Store a short, user-readable message — this is surfaced on the /gtfs page.
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    if (feedId) {
      await db
        .update(gtfsFeeds)
        .set({
          status:       "failed",
          errorMessage: message,
        })
        .where(eq(gtfsFeeds.id, feedId))
        .catch(() => {});
    }
    // Failed feeds are re-uploaded, not retried — clean up the raw ZIP too.
    if (zipUrl) await del(zipUrl).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
