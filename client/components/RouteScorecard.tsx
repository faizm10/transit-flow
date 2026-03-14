"use client";

import { useMemo } from "react";
import {
  computeRouteScore,
  type ScoreInputs,
  type RouteScore,
} from "@/lib/routeScoring";

type RouteScorecardProps = ScoreInputs;

const GRADE_COLORS: Record<RouteScore["grade"], string> = {
  A: "text-emerald-600",
  B: "text-sky-600",
  C: "text-amber-600",
  D: "text-orange-600",
  F: "text-rose-500",
};

const DIM_COLORS: Record<string, string> = {
  Frequency: "bg-blue-500",
  Coverage: "bg-emerald-500",
  Connectivity: "bg-purple-500",
  Efficiency: "bg-amber-500",
};

export function RouteScorecard(props: RouteScorecardProps) {
  const score = useMemo(() => computeRouteScore(props), [props]);

  return (
    <div className="space-y-3 rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Route Score
        </span>
        <span
          className={`text-base font-bold ${GRADE_COLORS[score.grade]}`}
        >
          {score.grade}&nbsp;
          <span className="text-[10px] font-normal text-slate-400">
            {score.overall}/100
          </span>
        </span>
      </div>
      <div className="space-y-1.5">
        {Object.values(score.dimensions).map((dim) => (
          <div key={dim.label}>
            <div className="mb-1 flex justify-between text-[10px] text-slate-500">
              <span>{dim.label}</span>
              <span className="font-medium text-slate-600">{Math.round(dim.score)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${DIM_COLORS[dim.label] ?? "bg-blue-500"} transition-all duration-500`}
                style={{ width: `${dim.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
