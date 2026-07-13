import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { del, list } from "@vercel/blob";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedId } = await params;

  const rows = await db
    .select({ id: gtfsFeeds.id, userId: gtfsFeeds.userId })
    .from(gtfsFeeds)
    .where(eq(gtfsFeeds.id, feedId))
    .limit(1);
  const feed = rows[0];
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Anonymous feeds (null userId) are deletable by anyone holding the
  // unguessable feed UUID — sign-in is currently optional. Feeds that were
  // uploaded under an account still require that account's session.
  if (feed.userId) {
    let sessionUserId: string | null = null;
    try {
      const session = await auth();
      sessionUserId = session?.user?.id ?? null;
    } catch { /* anonymous */ }
    if (sessionUserId !== feed.userId) {
      return NextResponse.json(
        { error: "This feed belongs to a signed-in account" },
        { status: 403 },
      );
    }
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
