-- City GTFS feeds — additive-only migration (safe to re-run).
-- Apply via the Neon SQL editor, or `npx drizzle-kit push` with DATABASE_URL set.
CREATE TABLE IF NOT EXISTS "city_feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "agency" text,
  "color" text NOT NULL,
  "stats" jsonb NOT NULL,
  "byte_size" integer NOT NULL,
  "chunk_count" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "city_feeds_user_id_community_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "community_users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "city_feed_chunks" (
  "feed_id" uuid NOT NULL,
  "idx" integer NOT NULL,
  "data" text NOT NULL,
  CONSTRAINT "city_feed_chunks_feed_id_idx_pk" PRIMARY KEY ("feed_id","idx"),
  CONSTRAINT "city_feed_chunks_feed_id_city_feeds_id_fk"
    FOREIGN KEY ("feed_id") REFERENCES "city_feeds"("id") ON DELETE CASCADE
);
