import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, cityFeeds, cityFeedChunks } from "@/lib/db";
import { and, eq } from "drizzle-orm";

// Binary body per chunk — client slices at 2MB, well under Vercel's ~4.5MB cap.
const MAX_CHUNK_BYTES = 3 * 1024 * 1024;

// ── PUT /api/city-feeds/[id]/chunks?idx=N — upload one gzip slice ───────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const idx = Number(req.nextUrl.searchParams.get("idx"));

    const [feed] = await db
      .select({ id: cityFeeds.id, chunkCount: cityFeeds.chunkCount })
      .from(cityFeeds)
      .where(and(eq(cityFeeds.id, id), eq(cityFeeds.userId, session.user.id)))
      .limit(1);
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }
    if (!Number.isInteger(idx) || idx < 0 || idx >= feed.chunkCount) {
      return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 });
    }

    const body = Buffer.from(await req.arrayBuffer());
    if (body.length === 0 || body.length > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Invalid chunk size" }, { status: 400 });
    }

    await db
      .insert(cityFeedChunks)
      .values({ feedId: id, idx, data: body.toString("base64") })
      .onConflictDoUpdate({
        target: [cityFeedChunks.feedId, cityFeedChunks.idx],
        set: { data: body.toString("base64") },
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[city-feeds/:id/chunks PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
