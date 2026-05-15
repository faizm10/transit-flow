import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, posts, likes, users } from "@/lib/db";
import { upsertUser } from "@/lib/upsertUser";
import { eq, and, count } from "drizzle-orm";

// ── GET /api/community/posts/[id]/likes — is current user liked? ─────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ liked: false });
    }

    const [row] = await db
      .select({ postId: likes.postId })
      .from(likes)
      .where(and(eq(likes.postId, postId), eq(likes.userId, session.user.id)))
      .limit(1);

    return NextResponse.json({ liked: !!row });
  } catch (err) {
    console.error("[community/likes GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/community/posts/[id]/likes — toggle like ───────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await upsertUser(session);

    // Check if already liked
    const [existing] = await db
      .select({ postId: likes.postId })
      .from(likes)
      .where(and(eq(likes.postId, postId), eq(likes.userId, session.user.id)))
      .limit(1);

    let liked: boolean;

    if (existing) {
      // Unlike
      await db
        .delete(likes)
        .where(and(eq(likes.postId, postId), eq(likes.userId, session.user.id)));
      liked = false;
    } else {
      // Like
      await db.insert(likes).values({ postId, userId: session.user.id });
      liked = true;
    }

    // Recalculate denormalized count
    const [{ newCount }] = await db
      .select({ newCount: count() })
      .from(likes)
      .where(eq(likes.postId, postId));

    await db
      .update(posts)
      .set({ likesCount: newCount })
      .where(eq(posts.id, postId));

    return NextResponse.json({ liked, likesCount: newCount });
  } catch (err) {
    console.error("[community/likes POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
