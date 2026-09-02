import type { RouteScore, ScoreGrade } from "@/lib/routeScoring";
import { cn } from "@/lib/utils";

// ─── Grade helpers ─────────────────────────────────────────────────────────

function gradeColor(grade: ScoreGrade): string {
  switch (grade) {
    case "A+": return "bg-emerald-500 text-white";
    case "A":  return "bg-emerald-400 text-white";
    case "B":  return "bg-yellow-400 text-slate-900";
    case "C":  return "bg-orange-400 text-white";
    case "D":  return "bg-red-400 text-white";
    case "F":  return "bg-red-600 text-white";
  }
}

function gradeBarColor(grade: ScoreGrade): string {
  switch (grade) {
    case "A+": return "bg-emerald-500";
    case "A":  return "bg-emerald-400";
    case "B":  return "bg-yellow-400";
    case "C":  return "bg-orange-400";
    case "D":  return "bg-red-400";
    case "F":  return "bg-red-600";
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────

interface MetricRowProps {
  label: string;
  value: string;
  grade: ScoreGrade;
  pct: number;
}

function MetricRow({ label, value, grade, pct }: MetricRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">{value}</span>
          <span
            className={cn(
              "w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center",
              gradeColor(grade)
            )}
          >
            {grade}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-[#1e3a5f]">
        <div
          className={cn("h-full rounded-full transition-all", gradeBarColor(grade))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface RouteScoreProps {
  score: RouteScore;
  className?: string;
}

export default function RouteScorecard({ score, className }: RouteScoreProps) {
  const freqLabel =
    score.frequencyMins !== null
      ? `Every ${score.frequencyMins} min`
      : "Fixed schedule";

  const corridorPct = Math.min(100, Math.round((score.corridorKm / 50) * 100));

  const freqPct = (() => {
    const m = score.frequencyMins;
    if (m === null) return 55;
    if (m <= 10) return 100;
    if (m <= 15) return 85;
    if (m <= 20) return 70;
    if (m <= 30) return 55;
    if (m <= 60) return 35;
    return 10;
  })();

  const svcHoursPct = (() => {
    const h = score.serviceHours;
    if (h >= 18) return 100;
    if (h >= 16) return 85;
    if (h >= 14) return 70;
    if (h >= 12) return 55;
    if (h >= 8) return 35;
    return 10;
  })();

  const stopPct = (() => {
    const s = score.stopCount;
    if (s >= 12) return 100;
    if (s >= 8) return 80;
    if (s >= 5) return 60;
    if (s >= 3) return 40;
    return 20;
  })();

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#1e3a5f] bg-[#0f1e35] p-5",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Route Impact Score</p>
          <p className="text-xs text-slate-500">{score.scorePercent}/100</p>
        </div>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold shadow-sm",
            gradeColor(score.grade)
          )}
        >
          {score.grade}
        </div>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-3">
        <MetricRow
          label="Frequency"
          value={freqLabel}
          grade={score.frequencyGrade}
          pct={freqPct}
        />
        <MetricRow
          label="Corridor"
          value={`${score.corridorKm} km`}
          grade={score.corridorGrade}
          pct={corridorPct}
        />
        <MetricRow
          label="Service hours"
          value={score.serviceHours > 0 ? `${score.serviceHours} h/day` : "—"}
          grade={score.serviceHoursGrade}
          pct={svcHoursPct}
        />
        <MetricRow
          label="Stops"
          value={`${score.stopCount} stop${score.stopCount !== 1 ? "s" : ""}`}
          grade={score.stopCountGrade}
          pct={stopPct}
        />
      </div>
    </div>
  );
}
