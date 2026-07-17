import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

// ── Users ──────────────────────────────────────────────────────────────────
// Synced from JWT on first write (post, like, comment).
export const users = pgTable("community_users", {
  id: text("id").primaryKey(),            // GitHub numeric user id (JWT sub)
  name: text("name"),
  avatarUrl: text("avatar_url"),
  githubLogin: text("github_login"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Posts ──────────────────────────────────────────────────────────────────
export const posts = pgTable("community_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  routeData: jsonb("route_data").notNull(),  // serialized CustomRoute
  stopCount: integer("stop_count").notNull().default(0),
  routeType: text("route_type").notNull(),   // "bus" | "train"
  color: text("color").notNull(),
  likesCount: integer("likes_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Likes ──────────────────────────────────────────────────────────────────
export const likes = pgTable(
  "community_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })]
);

// ── Comments ──────────────────────────────────────────────────────────────
export const comments = pgTable("community_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── City GTFS feeds ────────────────────────────────────────────────────────
// User-uploaded GTFS feeds from other cities, reduced client-side to a
// compact payload (stops + route patterns + timings), gzipped and stored in
// ordered base64 chunks (each chunk uploads under Vercel's ~4.5MB body cap).
export const cityFeeds = pgTable("city_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),              // user label, e.g. "TTC"
  agency: text("agency"),                    // from agency.txt
  color: text("color").notNull(),            // overlay accent color
  stats: jsonb("stats").notNull(),           // CityFeedStats (counts, bbox, dates)
  byteSize: integer("byte_size").notNull(),  // gzipped payload size
  chunkCount: integer("chunk_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cityFeedChunks = pgTable(
  "city_feed_chunks",
  {
    feedId: uuid("feed_id")
      .notNull()
      .references(() => cityFeeds.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    data: text("data").notNull(),            // base64 of one gzip slice
  },
  (table) => [primaryKey({ columns: [table.feedId, table.idx] })]
);

// ── Type exports ──────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type CityFeed = typeof cityFeeds.$inferSelect;
export type CityFeedChunk = typeof cityFeedChunks.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Like = typeof likes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type NewComment = typeof comments.$inferInsert;
