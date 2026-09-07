-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Precomputed per-stop route count
--
-- Additive and safe to re-run. Apply through the Neon SQL editor.
--
-- Why: the stops list shows how many routes call at each stop. Computing that
-- per request means joining stop_times to trips — measured at 3.9s for one
-- page of 51 stops on the real GO feed (a sequential scan of 186,901 trips,
-- 51 times over), and still 382ms when batched for the page.
--
-- The same aggregate over the *whole* feed takes 211ms, because it scans
-- stop_times once. So it is computed once per import, in the worker's
-- `analyzing` stage, and the stops page becomes a pure index scan.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE "gtfs_stops" ADD COLUMN IF NOT EXISTS "route_count" integer;

COMMIT;
