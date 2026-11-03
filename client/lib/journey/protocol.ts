/** Messages between `useJourneyTest` and `journeyPlanner.worker.ts`. */

import type { CustomRoute } from "@/lib/gtfs";
import type { JourneyComparison, SweepRow, SweepSummary } from "./planner";
import type { JourneyPlace, PlanResult, SearchLimits } from "./types";

interface RequestBase {
  id: number;
  /** Service date, "YYYY-MM-DD". */
  date: string;
  origin: JourneyPlace;
  destination: JourneyPlace;
  route: CustomRoute;
}

/** Compare one departure. */
export interface JourneyTestRequest extends RequestBase {
  kind: "single";
  departSec: number;
}

/** Compare every `stepSec` from `startSec` to `endSec`. */
export interface JourneySweepRequest extends RequestBase {
  kind: "sweep";
  startSec: number;
  endSec: number;
  stepSec: number;
}

export type JourneyRequest = JourneyTestRequest | JourneySweepRequest;

/** Which real dates the GO timetable was derived from. */
export interface FeedBasis {
  startDate: string;
  endDate: string;
  serviceDates: string[];
}

export interface JourneyTestResult {
  kind: "single";
  base: PlanResult;
  withRoute: PlanResult;
  comparison: JourneyComparison;
  feed: FeedBasis | null;
}

export interface JourneySweepResult {
  kind: "sweep";
  rows: SweepRow[];
  summary: SweepSummary;
  limits: SearchLimits;
  feed: FeedBasis | null;
}

export type JourneyResult = JourneyTestResult | JourneySweepResult;

export type JourneyWorkerMessage =
  | { type: "progress"; id: number; phase: string }
  | { type: "result"; id: number; result: JourneyResult }
  | { type: "error"; id: number; message: string };
