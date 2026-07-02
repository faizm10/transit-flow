import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { desc, eq, inArray, or, type SQL } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 50;

/**
 * List feeds by explicit IDs (?ids=a,b,c — the browser's localStorage list;
 * sign-in is currently optional). If a session exists, that account's feeds
 * are merged in so older sign-in-era uploads still appear.
 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(s => UUID_RE.test(s))
    .slice(0, MAX_IDS);

  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session?.user?.id ?? null;
  } catch { /* anonymous */ }

  const conditions: SQL[] = [];
  if (ids.length > 0) conditions.push(inArray(gtfsFeeds.id, ids));
  if (userId) conditions.push(eq(gtfsFeeds.userId, userId));
  if (conditions.length === 0) {
    return NextResponse.json({ feeds: [] });
  }

  try {
    const feeds = await db
      .select({
        id:           gtfsFeeds.id,
        cityName:     gtfsFeeds.cityName,
        status:       gtfsFeeds.status,
        routeCount:   gtfsFeeds.routeCount,
        stopCount:    gtfsFeeds.stopCount,
        errorMessage: gtfsFeeds.errorMessage,
        createdAt:    gtfsFeeds.createdAt,
      })
      .from(gtfsFeeds)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .orderBy(desc(gtfsFeeds.createdAt));

    return NextResponse.json({ feeds });
  } catch (err) {
    console.error("[gtfs/feeds] error:", err);
    return NextResponse.json({ error: "Failed to load feeds" }, { status: 500 });
  }
}
