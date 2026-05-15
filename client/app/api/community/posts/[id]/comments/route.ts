import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, comments, users, posts } from "@/lib/db";
import { upsertUser } from "@/lib/upsertUser";
import { eq, asc } from "drizzle-orm";

// ── GET /api/community/posts/[id]/comments — public ──────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    const rows = await db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        userId: comments.userId,
        userName: users.name,
        userAvatar: users.avatarUrl,
        userLogin: users.githubLogin,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.postId, postId))
      .orderBy(asc(comments.createdAt));

    return NextResponse.json({
      comments: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt,
        user: {
          id: r.userId,
          name: r.userName,
          avatarUrl: r.userAvatar,
          githubLogin: r.userLogin,
        },
      })),
    });
  } catch (err) {
    console.error("[community/comments GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/community/posts/[id]/comments — auth required ──────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as { body?: string };
    const text = body?.body?.trim();

    if (!text || text.length === 0) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Comment must be 2000 characters or less" }, { status: 400 });
    }

    await upsertUser(session);

    const [comment] = await db
      .insert(comments)
      .values({ postId, userId: session.user.id, body: text })
      .returning({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
      });

    const user = session.user as typeof session.user & { login?: string };

    return NextResponse.json(
      {
        comment: {
          ...comment,
          user: {
            id: session.user.id,
            name: session.user.name ?? null,
            avatarUrl: session.user.image ?? null,
            githubLogin: user.login ?? null,
          },
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[community/comments POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
