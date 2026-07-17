import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, cityFeeds } from "@/lib/db";
import { upsertUser } from "@/lib/upsertUser";
import { desc, eq, count } from "drizzle-orm";
import type { CityFeedStats } from "@/lib/cityGtfs";

/** Guardrails so one account can't fill the database. */
const MAX_FEEDS_PER_USER = 6;
const MAX_PAYLOAD_BYTES = 24 * 1024 * 1024; // gzipped
const MAX_CHUNKS = 16;

// ── GET /api/city-feeds — list the signed-in user's saved feeds ─────────────
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ feeds: [] });
    }

    const rows = await db
      .select({
        id: cityFeeds.id,
        name: cityFeeds.name,
        agency: cityFeeds.agency,
        color: cityFeeds.color,
        stats: cityFeeds.stats,
        byteSize: cityFeeds.byteSize,
        createdAt: cityFeeds.createdAt,
      })
      .from(cityFeeds)
      .where(eq(cityFeeds.userId, session.user.id))
      .orderBy(desc(cityFeeds.createdAt));

    return NextResponse.json({ feeds: rows });
  } catch (err) {
    console.error("[city-feeds GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/city-feeds — register a feed before uploading its chunks ──────
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to save city feeds" }, { status: 401 });
    }

    const body = (await req.json()) as {
      name?: string;
      agency?: string | null;
      color?: string;
      stats?: CityFeedStats;
      byteSize?: number;
      chunkCount?: number;
    };

    const name = body.name?.trim().slice(0, 60);
    const color = body.color?.trim() ?? "";
    if (!name || !body.stats || !body.byteSize || !body.chunkCount) {
      return NextResponse.json({ error: "Missing feed metadata" }, { status: 400 });
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    if (body.byteSize > MAX_PAYLOAD_BYTES || body.chunkCount > MAX_CHUNKS) {
      return NextResponse.json(
        { error: "Feed too large — try a smaller GTFS export" },
        { status: 413 }
      );
    }

    await upsertUser(session);

    const [{ existing }] = await db
      .select({ existing: count() })
      .from(cityFeeds)
      .where(eq(cityFeeds.userId, session.user.id));
    if (existing >= MAX_FEEDS_PER_USER) {
      return NextResponse.json(
        { error: `Limit of ${MAX_FEEDS_PER_USER} saved feeds reached — delete one first` },
        { status: 409 }
      );
    }

    const [feed] = await db
      .insert(cityFeeds)
      .values({
        userId: session.user.id,
        name,
        agency: body.agency?.trim().slice(0, 120) || null,
        color: color.toLowerCase(),
        stats: body.stats,
        byteSize: body.byteSize,
        chunkCount: body.chunkCount,
      })
      .returning({ id: cityFeeds.id });

    return NextResponse.json({ id: feed.id }, { status: 201 });
  } catch (err) {
    console.error("[city-feeds POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
