/** Messages between `useJourneyTest` and `journeyPlanner.worker.ts`. */

import type { CustomRoute } from "@/lib/gtfs";
import type { ImpactReport } from "./impact";
import type { JourneyComparison, SweepRow, SweepSummary } from "./planner";
import type { JourneyPlace, PlanResult, SearchLimits } from "./types";

interface RequestBase {
  id: number;
  /** Service date, "YYYY-MM-DD". */
  date: string;
  route: CustomRoute;
}

interface PlaceRequest extends RequestBase {
  origin: JourneyPlace;
  destination: JourneyPlace;
}

/** Compare one departure. */
export interface JourneyTestRequest extends PlaceRequest {
  kind: "single";
  departSec: number;
}

/** Compare every `stepSec` from `startSec` to `endSec`. */
export interface JourneySweepRequest extends PlaceRequest {
  kind: "sweep";
  startSec: number;
  endSec: number;
  stepSec: number;
}

/** Station-to-station impact report at departures `startSec`…`endSec` every `stepSec`. */
export interface NetworkImpactRequest extends RequestBase {
  kind: "impact";
  startSec: number;
  endSec: number;
  stepSec: number;
}

export type JourneyRequest = JourneyTestRequest | JourneySweepRequest | NetworkImpactRequest;

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

export interface NetworkImpactResult {
  kind: "impact";
  report: ImpactReport;
  feed: FeedBasis | null;
}

export type JourneyResult = JourneyTestResult | JourneySweepResult | NetworkImpactResult;

export type JourneyWorkerMessage =
  | { type: "progress"; id: number; phase: string; /** 0–1 when known. */ fraction?: number }
  | { type: "result"; id: number; result: JourneyResult }
  | { type: "error"; id: number; message: string };
