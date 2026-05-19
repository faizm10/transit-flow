import { cache } from "react";
import { db, posts, users, likes, comments } from "@/lib/db";
import { sql, desc, count } from "drizzle-orm";

// ── Overview counts ────────────────────────────────────────────────────────

export const getOverviewStats = cache(async () => {
  const [[postRow], [userRow], [likeRow], [commentRow]] = await Promise.all([
    db.select({ total: count() }).from(posts),
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(likes),
    db.select({ total: count() }).from(comments),
  ]);
  return {
    totalPosts:    postRow?.total    ?? 0,
    totalUsers:    userRow?.total    ?? 0,
    totalLikes:    likeRow?.total    ?? 0,
    totalComments: commentRow?.total ?? 0,
  };
});

// ── Posts per day (last 30 days) ───────────────────────────────────────────

export const getPostsOverTime = cache(async (days = 30) => {
  const rows = await db.execute(sql`
    SELECT
      date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
      COUNT(*)::int AS count
    FROM community_posts
    WHERE created_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  return rows.rows as { day: string; count: number }[];
});

// ── New users per day (last 30 days) ──────────────────────────────────────

export const getUsersOverTime = cache(async (days = 30) => {
  const rows = await db.execute(sql`
    SELECT
      date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
      COUNT(*)::int AS count
    FROM community_users
    WHERE created_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  return rows.rows as { day: string; count: number }[];
});

// ── Top posts ──────────────────────────────────────────────────────────────

export const getTopPosts = cache(async (limit = 10) => {
  return db
    .select({
      id:         posts.id,
      title:      posts.title,
      routeType:  posts.routeType,
      stopCount:  posts.stopCount,
      likesCount: posts.likesCount,
      createdAt:  posts.createdAt,
      userName:   users.name,
      userLogin:  users.githubLogin,
    })
    .from(posts)
    .leftJoin(users, sql`${users.id} = ${posts.userId}`)
    .orderBy(desc(posts.likesCount))
    .limit(limit);
});

// ── Route type breakdown ───────────────────────────────────────────────────

export const getRouteBreakdown = cache(async () => {
  const rows = await db.execute(sql`
    SELECT route_type, COUNT(*)::int AS count
    FROM community_posts
    GROUP BY route_type
  `);
  const result: Record<string, number> = {};
  for (const row of rows.rows as { route_type: string; count: number }[]) {
    result[row.route_type] = row.count;
  }
  return result;
});

// ── Recent users ───────────────────────────────────────────────────────────

export const getRecentUsers = cache(async (limit = 8) => {
  return db
    .select({
      id:        users.id,
      name:      users.name,
      avatarUrl: users.avatarUrl,
      login:     users.githubLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
});
