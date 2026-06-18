import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { del, list } from "@vercel/blob";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: feedId } = await params;

  // Verify ownership
  const rows = await db
    .select({ id: gtfsFeeds.id })
    .from(gtfsFeeds)
    .where(and(eq(gtfsFeeds.id, feedId), eq(gtfsFeeds.userId, session.user.id)))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Delete all Blob files for this feed
    const { blobs } = await list({ prefix: `feeds/${feedId}/` });
    if (blobs.length > 0) {
      await del(blobs.map(b => b.url));
    }

    // Delete DB row
    await db.delete(gtfsFeeds).where(eq(gtfsFeeds.id, feedId));

    return NextResponse.json({ deleted: feedId });
  } catch (err) {
    console.error("[gtfs/feeds/delete] error:", err);
    return NextResponse.json({ error: "Failed to delete feed" }, { status: 500 });
  }
}
