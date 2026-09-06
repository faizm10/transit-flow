-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Dataset platform: control plane + normalized GTFS entities
--
-- Additive only, and safe to re-run. Nothing here drops or alters an existing
-- table; community_* and city_feeds are untouched and keep working.
--
-- Apply through the Neon SQL editor. DATABASE_URL is a Vercel *Sensitive*
-- variable, so `vercel env pull` returns an empty value and `drizzle-kit push`
-- cannot reach the database from a developer machine.
--
-- Two planes:
--   Control  datasets, dataset_uploads, ingestion_jobs, processing_events,
--            dataset_issues, dataset_metrics
--   Query    gtfs_* — written once per ingestion with COPY, read by query
--
-- ingestion_jobs doubles as the work queue; there is no Redis. See
-- docs/architecture/00-assessment.md §5.3.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"feed_info" jsonb,
	"artifact_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "dataset_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text,
	"multipart_upload_id" text,
	"part_size" integer,
	"part_count" integer,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"upload_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"stage" text DEFAULT 'created' NOT NULL,
	"last_completed_stage" text,
	"progress_current" bigint,
	"progress_total" bigint,
	"progress_unit" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error" jsonb,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "processing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"kind" text NOT NULL,
	"message" text,
	"data" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dataset_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"job_id" uuid,
	"severity" text NOT NULL,
	"code" text NOT NULL,
	"file" text,
	"message" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"sample" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dataset_metrics" (
	"dataset_id" uuid PRIMARY KEY NOT NULL,
	"metrics" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gtfs_agencies" (
	"dataset_id" uuid NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"timezone" text,
	"lang" text,
	"phone" text,
	"fare_url" text,
	CONSTRAINT "gtfs_agencies_dataset_id_agency_id_pk" PRIMARY KEY("dataset_id","agency_id")
);

CREATE TABLE IF NOT EXISTS "gtfs_routes" (
	"dataset_id" uuid NOT NULL,
	"route_id" text NOT NULL,
	"agency_id" text,
	"short_name" text,
	"long_name" text,
	"description" text,
	"type" smallint NOT NULL,
	"color" text,
	"text_color" text,
	"sort_order" integer,
	CONSTRAINT "gtfs_routes_dataset_id_route_id_pk" PRIMARY KEY("dataset_id","route_id")
);

CREATE TABLE IF NOT EXISTS "gtfs_stops" (
	"dataset_id" uuid NOT NULL,
	"stop_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"lat" double precision,
	"lon" double precision,
	"zone_id" text,
	"location_type" smallint DEFAULT 0 NOT NULL,
	"parent_station" text,
	"timezone" text,
	"wheelchair_boarding" smallint,
	"platform_code" text,
	CONSTRAINT "gtfs_stops_dataset_id_stop_id_pk" PRIMARY KEY("dataset_id","stop_id")
);

CREATE TABLE IF NOT EXISTS "gtfs_services" (
	"dataset_id" uuid NOT NULL,
	"service_id" text NOT NULL,
	"monday" boolean DEFAULT false NOT NULL,
	"tuesday" boolean DEFAULT false NOT NULL,
	"wednesday" boolean DEFAULT false NOT NULL,
	"thursday" boolean DEFAULT false NOT NULL,
	"friday" boolean DEFAULT false NOT NULL,
	"saturday" boolean DEFAULT false NOT NULL,
	"sunday" boolean DEFAULT false NOT NULL,
	"start_date" date,
	"end_date" date,
	CONSTRAINT "gtfs_services_dataset_id_service_id_pk" PRIMARY KEY("dataset_id","service_id")
);

CREATE TABLE IF NOT EXISTS "gtfs_service_exceptions" (
	"dataset_id" uuid NOT NULL,
	"service_id" text NOT NULL,
	"date" date NOT NULL,
	"exception_type" smallint NOT NULL,
	CONSTRAINT "gtfs_service_exceptions_dataset_id_service_id_date_pk" PRIMARY KEY("dataset_id","service_id","date")
);

CREATE TABLE IF NOT EXISTS "gtfs_shapes" (
	"dataset_id" uuid NOT NULL,
	"shape_id" text NOT NULL,
	"points" jsonb NOT NULL,
	"point_count" integer NOT NULL,
	"simplified" jsonb,
	CONSTRAINT "gtfs_shapes_dataset_id_shape_id_pk" PRIMARY KEY("dataset_id","shape_id")
);

CREATE TABLE IF NOT EXISTS "gtfs_trips" (
	"dataset_id" uuid NOT NULL,
	"trip_id" text NOT NULL,
	"route_id" text NOT NULL,
	"service_id" text NOT NULL,
	"headsign" text,
	"short_name" text,
	"direction_id" smallint,
	"block_id" text,
	"shape_id" text,
	"wheelchair_accessible" smallint,
	"bikes_allowed" smallint,
	CONSTRAINT "gtfs_trips_dataset_id_trip_id_pk" PRIMARY KEY("dataset_id","trip_id")
);

CREATE TABLE IF NOT EXISTS "gtfs_stop_times" (
	"dataset_id" uuid NOT NULL,
	"trip_id" text NOT NULL,
	"stop_sequence" integer NOT NULL,
	"stop_id" text NOT NULL,
	"arrival_time" integer,
	"departure_time" integer,
	"stop_headsign" text,
	"pickup_type" smallint,
	"drop_off_type" smallint,
	"shape_dist_traveled" real,
	"timepoint" smallint,
	CONSTRAINT "gtfs_stop_times_dataset_id_trip_id_stop_sequence_pk" PRIMARY KEY("dataset_id","trip_id","stop_sequence")
);


-- ── Foreign keys ──────────────────────────────────────────────────────────
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is guarded by a
-- catalog check to keep this file re-runnable.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_issues_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "dataset_issues" ADD CONSTRAINT "dataset_issues_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_issues_job_id_ingestion_jobs_id_fk') THEN
    ALTER TABLE "dataset_issues" ADD CONSTRAINT "dataset_issues_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_metrics_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "dataset_metrics" ADD CONSTRAINT "dataset_metrics_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_uploads_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "dataset_uploads" ADD CONSTRAINT "dataset_uploads_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'datasets_owner_id_community_users_id_fk') THEN
    ALTER TABLE "datasets" ADD CONSTRAINT "datasets_owner_id_community_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."community_users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingestion_jobs_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingestion_jobs_upload_id_dataset_uploads_id_fk') THEN
    ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_upload_id_dataset_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."dataset_uploads"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'processing_events_job_id_ingestion_jobs_id_fk') THEN
    ALTER TABLE "processing_events" ADD CONSTRAINT "processing_events_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_agencies_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_agencies" ADD CONSTRAINT "gtfs_agencies_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_routes_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_routes" ADD CONSTRAINT "gtfs_routes_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_service_exceptions_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_service_exceptions" ADD CONSTRAINT "gtfs_service_exceptions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_services_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_services" ADD CONSTRAINT "gtfs_services_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_shapes_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_shapes" ADD CONSTRAINT "gtfs_shapes_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_stop_times_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_stop_times" ADD CONSTRAINT "gtfs_stop_times_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_stops_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_stops" ADD CONSTRAINT "gtfs_stops_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gtfs_trips_dataset_id_datasets_id_fk') THEN
    ALTER TABLE "gtfs_trips" ADD CONSTRAINT "gtfs_trips_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;


-- ── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "dataset_issues_dataset_severity_idx" ON "dataset_issues" USING btree ("dataset_id","severity");

CREATE UNIQUE INDEX IF NOT EXISTS "dataset_issues_dataset_job_code_file_uidx" ON "dataset_issues" USING btree ("dataset_id","job_id","code","file");

CREATE INDEX IF NOT EXISTS "dataset_uploads_dataset_idx" ON "dataset_uploads" USING btree ("dataset_id");

CREATE UNIQUE INDEX IF NOT EXISTS "dataset_uploads_storage_key_uidx" ON "dataset_uploads" USING btree ("storage_key");

CREATE UNIQUE INDEX IF NOT EXISTS "dataset_uploads_one_active_uidx" ON "dataset_uploads" USING btree ("dataset_id") WHERE "dataset_uploads"."status" in ('pending', 'uploading');

CREATE INDEX IF NOT EXISTS "datasets_owner_created_idx" ON "datasets" USING btree ("owner_id","created_at");

CREATE INDEX IF NOT EXISTS "datasets_status_idx" ON "datasets" USING btree ("status");

CREATE INDEX IF NOT EXISTS "ingestion_jobs_dataset_created_idx" ON "ingestion_jobs" USING btree ("dataset_id","created_at");

CREATE INDEX IF NOT EXISTS "ingestion_jobs_claimable_idx" ON "ingestion_jobs" USING btree ("run_after") WHERE "ingestion_jobs"."status" = 'pending';

CREATE INDEX IF NOT EXISTS "ingestion_jobs_running_heartbeat_idx" ON "ingestion_jobs" USING btree ("heartbeat_at") WHERE "ingestion_jobs"."status" = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS "ingestion_jobs_one_live_uidx" ON "ingestion_jobs" USING btree ("dataset_id") WHERE "ingestion_jobs"."status" in ('pending', 'running');

CREATE INDEX IF NOT EXISTS "processing_events_job_created_idx" ON "processing_events" USING btree ("job_id","created_at");

CREATE INDEX IF NOT EXISTS "gtfs_routes_dataset_type_idx" ON "gtfs_routes" USING btree ("dataset_id","type");

CREATE INDEX IF NOT EXISTS "gtfs_routes_dataset_sort_idx" ON "gtfs_routes" USING btree ("dataset_id","sort_order");

CREATE INDEX IF NOT EXISTS "gtfs_routes_dataset_short_name_idx" ON "gtfs_routes" USING btree ("dataset_id","short_name");

CREATE INDEX IF NOT EXISTS "gtfs_service_exceptions_dataset_date_idx" ON "gtfs_service_exceptions" USING btree ("dataset_id","date");

CREATE INDEX IF NOT EXISTS "gtfs_services_dataset_range_idx" ON "gtfs_services" USING btree ("dataset_id","start_date","end_date");

CREATE INDEX IF NOT EXISTS "gtfs_stop_times_dataset_stop_departure_idx" ON "gtfs_stop_times" USING btree ("dataset_id","stop_id","departure_time");

CREATE INDEX IF NOT EXISTS "gtfs_stops_dataset_lat_lon_idx" ON "gtfs_stops" USING btree ("dataset_id","lat","lon");

CREATE INDEX IF NOT EXISTS "gtfs_stops_dataset_name_idx" ON "gtfs_stops" USING btree ("dataset_id","name");

CREATE INDEX IF NOT EXISTS "gtfs_stops_dataset_parent_idx" ON "gtfs_stops" USING btree ("dataset_id","parent_station");

CREATE INDEX IF NOT EXISTS "gtfs_trips_dataset_route_direction_idx" ON "gtfs_trips" USING btree ("dataset_id","route_id","direction_id");

CREATE INDEX IF NOT EXISTS "gtfs_trips_dataset_service_idx" ON "gtfs_trips" USING btree ("dataset_id","service_id");

CREATE INDEX IF NOT EXISTS "gtfs_trips_dataset_shape_idx" ON "gtfs_trips" USING btree ("dataset_id","shape_id");


COMMIT;

-- ── After applying ────────────────────────────────────────────────────────
-- gtfs_stop_times will hold millions of rows per dataset. Give the planner
-- real statistics on the columns that drive its two access paths:
--
--   ANALYZE gtfs_stop_times;
--   ANALYZE gtfs_trips;
--   ANALYZE gtfs_stops;
--
-- The worker runs these itself at the end of the `indexing` stage; the lines
-- above are only for a manually loaded dataset.
