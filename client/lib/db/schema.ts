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

// ── GTFS Feeds ────────────────────────────────────────────────────────────────
// User-uploaded GTFS feeds for arbitrary city transit networks.
export const gtfsFeeds = pgTable("gtfs_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  cityName: text("city_name").notNull(),
  // "uploading" | "processing" | "ready" | "failed"
  status: text("status").notNull().default("uploading"),
  errorMessage: text("error_message"),
  // Public Vercel Blob base URL for derived files, e.g. https://<store>.blob.vercel-storage.com/feeds/<id>/derived
  blobBaseUrl: text("blob_base_url"),
  routeCount: integer("route_count"),
  stopCount: integer("stop_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Type exports ──────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Like = typeof likes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type GtfsFeed = typeof gtfsFeeds.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type NewComment = typeof comments.$inferInsert;
export type NewGtfsFeed = typeof gtfsFeeds.$inferInsert;
