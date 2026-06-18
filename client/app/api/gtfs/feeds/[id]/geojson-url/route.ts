import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedId } = await params;

  const rows = await db
    .select({ blobBaseUrl: gtfsFeeds.blobBaseUrl, status: gtfsFeeds.status })
    .from(gtfsFeeds)
    .where(eq(gtfsFeeds.id, feedId))
    .limit(1);

  const feed = rows[0];
  if (!feed || feed.status !== "ready" || !feed.blobBaseUrl) {
    return NextResponse.json({ error: "Feed not found or not ready" }, { status: 404 });
  }

  const geojsonUrl = `${feed.blobBaseUrl}/variant_lines.geojson`;
  // Redirect so Mapbox can load the GeoJSON directly from Blob CDN
  return NextResponse.redirect(geojsonUrl, { status: 302 });
}
