import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ feeds: [] });
  }

  try {
    const feeds = await db
      .select({
        id:         gtfsFeeds.id,
        cityName:   gtfsFeeds.cityName,
        status:     gtfsFeeds.status,
        routeCount:   gtfsFeeds.routeCount,
        stopCount:    gtfsFeeds.stopCount,
        errorMessage: gtfsFeeds.errorMessage,
        createdAt:    gtfsFeeds.createdAt,
      })
      .from(gtfsFeeds)
      .where(eq(gtfsFeeds.userId, session.user.id))
      .orderBy(desc(gtfsFeeds.createdAt));

    return NextResponse.json({ feeds });
  } catch (err) {
    console.error("[gtfs/feeds] error:", err);
    return NextResponse.json({ error: "Failed to load feeds" }, { status: 500 });
  }
}
