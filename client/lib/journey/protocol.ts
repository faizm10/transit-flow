/** Messages between `useJourneyTest` and `journeyPlanner.worker.ts`. */

import type { CustomRoute } from "@/lib/gtfs";
import type { JourneyComparison } from "./planner";
import type { JourneyPlace, PlanResult } from "./types";

export interface JourneyTestRequest {
  id: number;
  /** Service date, "YYYY-MM-DD". */
  date: string;
  departSec: number;
  origin: JourneyPlace;
  destination: JourneyPlace;
  route: CustomRoute;
}

/** Which real dates the GO timetable was derived from. */
export interface FeedBasis {
  startDate: string;
  endDate: string;
  serviceDates: string[];
}

export interface JourneyTestResult {
  base: PlanResult;
  withRoute: PlanResult;
  comparison: JourneyComparison;
  feed: FeedBasis | null;
}

export type JourneyWorkerMessage =
  | { type: "progress"; id: number; phase: string }
  | ({ type: "result"; id: number } & JourneyTestResult)
  | { type: "error"; id: number; message: string };
