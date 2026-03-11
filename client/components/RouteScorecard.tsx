"use client";

import { useMemo } from "react";
import {
  computeRouteScore,
  type ScoreInputs,
  type RouteScore,
} from "@/lib/routeScoring";

type RouteScorecardProps = ScoreInputs;

const GRADE_COLORS: Record<RouteScore["grade"], string> = {
  A: "text-emerald-400",
  B: "text-blue-400",
  C: "text-amber-400",
  D: "text-orange-400",
  F: "text-red-400",
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
    <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 text-[11px] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-white/70 font-semibold tracking-wide uppercase text-[10px]">
          Route Score
        </span>
        <span
          className={`text-base font-bold ${GRADE_COLORS[score.grade]}`}
        >
          {score.grade}&nbsp;
          <span className="text-white/50 text-[10px] font-normal">
            {score.overall}/100
          </span>
        </span>
      </div>
      <div className="space-y-1.5">
        {Object.values(score.dimensions).map((dim) => (
          <div key={dim.label}>
            <div className="flex justify-between text-[10px] text-white/50 mb-0.5">
              <span>{dim.label}</span>
              <span>{Math.round(dim.score)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
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
