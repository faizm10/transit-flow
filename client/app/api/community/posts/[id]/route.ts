import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, posts, users, comments } from "@/lib/db";
import { eq, asc } from "drizzle-orm";

// ── GET /api/community/posts/[id] — public, returns full post + route_data ───
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [row] = await db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        routeData: posts.routeData,
        stopCount: posts.stopCount,
        routeType: posts.routeType,
        color: posts.color,
        likesCount: posts.likesCount,
        createdAt: posts.createdAt,
        userId: posts.userId,
        userName: users.name,
        userAvatar: users.avatarUrl,
        userLogin: users.githubLogin,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .where(eq(posts.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      post: {
        id: row.id,
        title: row.title,
        description: row.description,
        routeData: row.routeData,
        stopCount: row.stopCount,
        routeType: row.routeType,
        color: row.color,
        likesCount: row.likesCount,
        createdAt: row.createdAt,
        user: {
          id: row.userId,
          name: row.userName,
          avatarUrl: row.userAvatar,
          githubLogin: row.userLogin,
        },
      },
    });
  } catch (err) {
    console.error("[community/posts/[id] GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/community/posts/[id] — update title + description (owner only) ─
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [post] = await db
      .select({ userId: posts.userId })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json() as { title?: string; description?: string };
    const updates: { title?: string; description?: string | null } = {};

    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t || t.length > 120) {
        return NextResponse.json({ error: "Invalid title" }, { status: 400 });
      }
      updates.title = t;
    }
    if ("description" in body) {
      updates.description = typeof body.description === "string"
        ? body.description.trim() || null
        : null;
    }

    await db.update(posts).set(updates).where(eq(posts.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[community/posts/[id] PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/community/posts/[id] — delete post (owner only) ──────────────
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
    const [post] = await db
      .select({ userId: posts.userId })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(posts).where(eq(posts.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[community/posts/[id] DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
