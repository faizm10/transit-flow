import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processGtfsFeed } from "@/lib/gtfsProcessor";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Verify internal secret
  const secret = req.headers.get("x-gtfs-secret");
  const expected = process.env.GTFS_PROCESS_SECRET ?? "dev-secret";
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let feedId: string | undefined;
  try {
    const body = await req.json() as { feedId?: string; blobUrl?: string };
    feedId = body.feedId;
    if (!feedId) {
      return NextResponse.json({ error: "Missing feedId" }, { status: 400 });
    }

    // Prefer the blobUrl passed directly from the register step; fall back to blob listing
    let zipUrl = body.blobUrl;
    if (!zipUrl) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: `feeds/${feedId}/raw/` });
      const rawBlob = blobs.find(b => b.pathname.endsWith("feed.zip"));
      if (!rawBlob) throw new Error(`Raw ZIP not found in Blob storage for feed ${feedId}`);
      zipUrl = rawBlob.url;
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

    return NextResponse.json({ feedId, status: "ready", ...result });
  } catch (err) {
    console.error("[gtfs/process] error:", err);
    if (feedId) {
      await db
        .update(gtfsFeeds)
        .set({
          status:       "failed",
          errorMessage: String(err),
        })
        .where(eq(gtfsFeeds.id, feedId))
        .catch(() => {});
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
