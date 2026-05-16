import { NextRequest, NextResponse } from "next/server";
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
