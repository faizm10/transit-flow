import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, cityFeeds, cityFeedChunks } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";

async function ownedFeed(feedId: string, userId: string) {
  const [feed] = await db
    .select({ id: cityFeeds.id, chunkCount: cityFeeds.chunkCount })
    .from(cityFeeds)
    .where(and(eq(cityFeeds.id, feedId), eq(cityFeeds.userId, userId)))
    .limit(1);
  return feed ?? null;
}

// ── GET /api/city-feeds/[id] — assembled gzipped payload (binary) ───────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const feed = await ownedFeed(id, session.user.id);
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const chunks = await db
      .select({ idx: cityFeedChunks.idx, data: cityFeedChunks.data })
      .from(cityFeedChunks)
      .where(eq(cityFeedChunks.feedId, id))
      .orderBy(asc(cityFeedChunks.idx));

    if (chunks.length !== feed.chunkCount) {
      return NextResponse.json(
        { error: "Feed upload incomplete — delete it and re-upload" },
        { status: 409 }
      );
    }

    const gzipped = Buffer.concat(chunks.map((c) => Buffer.from(c.data, "base64")));
    return new NextResponse(new Uint8Array(gzipped), {
      headers: {
        "Content-Type": "application/octet-stream",
        // Payloads are immutable once uploaded — let the browser cache them.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[city-feeds/:id GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/city-feeds/[id] ──────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const feed = await ownedFeed(id, session.user.id);
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    // Chunks cascade via FK
    await db.delete(cityFeeds).where(eq(cityFeeds.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[city-feeds/:id DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
