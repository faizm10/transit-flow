import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, posts, users, likes } from "@/lib/db";
import { upsertUser } from "@/lib/upsertUser";
import { desc, eq, sql, count } from "drizzle-orm";
import type { CustomRoute } from "@/lib/gtfs";

const PAGE_SIZE = 20;

// ── GET /api/community/posts — public paginated feed ─────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const sort = searchParams.get("sort") === "top" ? "top" : "recent";
    const offset = (page - 1) * PAGE_SIZE;

    const orderBy =
      sort === "top"
        ? desc(posts.likesCount)
        : desc(posts.createdAt);

    const rows = await db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
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
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(posts);

    const nextPage = offset + PAGE_SIZE < total ? page + 1 : null;

    return NextResponse.json({
      posts: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        stopCount: r.stopCount,
        routeType: r.routeType,
        color: r.color,
        likesCount: r.likesCount,
        createdAt: r.createdAt,
        user: {
          id: r.userId,
          name: r.userName,
          avatarUrl: r.userAvatar,
          githubLogin: r.userLogin,
        },
      })),
      total,
      nextPage,
    });
  } catch (err) {
    console.error("[community/posts GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/community/posts — create a post (auth required) ─────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as {
      title?: string;
      description?: string;
      routeData?: CustomRoute;
    };

    const { title, description, routeData } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (title.trim().length > 120) {
      return NextResponse.json({ error: "Title must be 120 characters or less" }, { status: 400 });
    }
    if (description && description.length > 1000) {
      return NextResponse.json({ error: "Description must be 1000 characters or less" }, { status: 400 });
    }
    if (!routeData || typeof routeData !== "object") {
      return NextResponse.json({ error: "routeData is required" }, { status: 400 });
    }

    await upsertUser(session);

    // Derive stats server-side from the route data
    const stopCount = Array.isArray(routeData.stops) ? routeData.stops.length : 0;
    const routeType = routeData.type === "train" ? "train" : "bus";
    const color = typeof routeData.color === "string" ? routeData.color : "#3b82f6";

    const [post] = await db
      .insert(posts)
      .values({
        userId: session.user.id,
        title: title.trim(),
        description: description?.trim() ?? null,
        routeData: routeData as unknown as Record<string, unknown>,
        stopCount,
        routeType,
        color,
        likesCount: 0,
      })
      .returning({ id: posts.id });

    return NextResponse.json({ post: { id: post.id } }, { status: 201 });
  } catch (err) {
    console.error("[community/posts POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
