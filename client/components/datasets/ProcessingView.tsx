"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Status, StatusDot } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/empty-state";
import {
  JOB_STAGES,
  STAGE_LABELS,
  isDeterminateStage,
  stageIndex,
  type JobStage,
  type JobStatus,
} from "@/lib/datasets/stages";
import { formatCount, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The processing screen.
 *
 * Deliberately not a spinner. A GTFS import runs for minutes and the user needs
 * to know it is alive, where it is, and what happens if it breaks.
 *
 * State comes entirely from the backend, so closing the tab and returning
 * reconstructs exactly what was on screen — the job row and its stage events
 * are the source of truth, not anything held in this component.
 *
 * The stages shown start at `validating`. Upload is a separate concern with its
 * own progress, and rolling the two into one bar is the thing Part 4 explicitly
 * rules out: they measure different work at wildly different speeds.
 */

/** Stages worth showing as a checklist; the earlier ones are upload concerns. */
const VISIBLE_STAGES: JobStage[] = [
  "validating",
  "extracting",
  "parsing",
  "importing",
  "indexing",
  "analyzing",
];

interface JobSnapshot {
  id: string;
  status: JobStatus;
  stage: JobStage;
  lastCompletedStage: JobStage | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressUnit: string | null;
  attempt: number;
  maxAttempts: number;
  error: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
    retryable: boolean;
  } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface StageEvent {
  stage: JobStage;
  kind: string;
  durationMs: number | null;
}

export function ProcessingView({
  datasetId,
  datasetName,
  initialJob,
}: {
  datasetId: string;
  datasetName: string;
  initialJob: JobSnapshot;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobSnapshot>(initialJob);
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [retrying, setRetrying] = useState(false);
  const finished = job.status === "succeeded" || job.status === "failed";

  // Keep the latest status in a ref so the polling effect does not restart on
  // every tick, which would reset the interval and make the cadence drift.
  const finishedRef = useRef(finished);
  finishedRef.current = finished;

  useEffect(() => {
    if (finished) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/datasets/${datasetId}/jobs/${job.id}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          job: JobSnapshot;
          events: StageEvent[];
          pollAfterMs: number | null;
        };
        if (cancelled) return;

        setJob(data.job);
        setEvents(data.events);

        if (data.pollAfterMs === null) {
          // Terminal: refresh the server components so the page becomes the
          // overview (or the failure state) without a manual reload.
          router.refresh();
          return;
        }
        timer = setTimeout(poll, data.pollAfterMs);
      } catch {
        // A failed poll is almost always a transient blip. Back off rather than
        // surfacing an error — the job itself is unaffected by our polling.
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [datasetId, job.id, finished, router]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/datasets/${datasetId}/jobs/${job.id}`, {
        method: "POST",
      });
      if (res.ok) router.refresh();
    } finally {
      setRetrying(false);
    }
  }, [datasetId, job.id, router]);

  const durationByStage = new Map(
    events
      .filter((e) => e.kind === "completed" && e.durationMs !== null)
      .map((e) => [e.stage, e.durationMs!])
  );

  if (job.status === "failed") {
    return (
      <FailureView
        job={job}
        datasetName={datasetName}
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  const currentIndex = stageIndex(job.stage);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <Status tone="info" pulse>
          {STAGE_LABELS[job.stage].active}
        </Status>
        {job.attempt > 1 && (
          <span className="text-xs text-muted-foreground">
            Attempt {job.attempt} of {job.maxAttempts}
          </span>
        )}
      </div>

      <Panel>
        <PanelContent className="space-y-1 pt-5">
          {VISIBLE_STAGES.map((stage) => {
            const index = stageIndex(stage);
            const done = index < currentIndex || job.status === "succeeded";
            const active = index === currentIndex && job.status !== "succeeded";
            return (
              <StageRow
                key={stage}
                stage={stage}
                done={done}
                active={active}
                durationMs={durationByStage.get(stage) ?? null}
                job={job}
              />
            );
          })}
        </PanelContent>
      </Panel>

      <p className="text-sm text-muted-foreground">
        This runs on the server. You can close this page — processing continues,
        and returning here picks up where it left off.
      </p>
    </div>
  );
}

function StageRow({
  stage,
  done,
  active,
  durationMs,
  job,
}: {
  stage: JobStage;
  done: boolean;
  active: boolean;
  durationMs: number | null;
  job: JobSnapshot;
}) {
  const label = STAGE_LABELS[stage];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-200",
        active && "bg-surface-sunken"
      )}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {done ? (
          <Check className="size-4 text-success" />
        ) : active ? (
          <StatusDot tone="info" pulse />
        ) : (
          <span className="size-1.5 rounded-full bg-border-strong" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "text-sm transition-colors duration-200",
              done && "text-foreground",
              active && "font-medium text-foreground",
              !done && !active && "text-muted-foreground/70"
            )}
          >
            {done ? label.done : label.active}
          </span>
          {durationMs !== null && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDuration(durationMs)}
            </span>
          )}
        </div>

        {active && <ActiveStageDetail stage={stage} job={job} />}
      </div>
    </div>
  );
}

/**
 * Progress for the stage that is running.
 *
 * Determinate only where the backend genuinely measures something. `indexing`
 * and `analyzing` report no numbers, and inventing one for them would teach
 * users that the percentage means nothing.
 */
function ActiveStageDetail({
  stage,
  job,
}: {
  stage: JobStage;
  job: JobSnapshot;
}) {
  const hasReal =
    isDeterminateStage(stage) &&
    job.progressCurrent !== null &&
    job.progressTotal !== null &&
    job.progressTotal > 0;

  const counted = job.progressCurrent !== null && job.progressUnit;

  return (
    <div className="mt-2 space-y-1.5">
      <Progress
        value={
          hasReal
            ? Math.round((job.progressCurrent! / job.progressTotal!) * 100)
            : null
        }
      />
      <p className="text-xs text-muted-foreground">
        {hasReal ? (
          <>
            {Math.round((job.progressCurrent! / job.progressTotal!) * 100)}% ·{" "}
            {formatCount(job.progressCurrent)} of{" "}
            {formatCount(job.progressTotal)} {job.progressUnit}
          </>
        ) : counted ? (
          // A running count with no known total is honest: we know how many
          // rows have landed, not how many there will be.
          <>
            {formatCount(job.progressCurrent)} {job.progressUnit} so far
          </>
        ) : (
          STAGE_LABELS[stage].description
        )}
      </p>
    </div>
  );
}

function FailureView({
  job,
  datasetName,
  onRetry,
  retrying,
}: {
  job: JobSnapshot;
  datasetName: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const error = job.error;
  const detail = error?.detail;

  return (
    <div className="space-y-5">
      <EmptyState
        variant="error"
        icon={AlertTriangle}
        title={`${datasetName} could not be imported`}
        description={
          error?.message ??
          "Processing stopped unexpectedly and no reason was recorded."
        }
        action={
          <>
            <Button onClick={onRetry} disabled={retrying}>
              <RotateCcw />
              {retrying ? "Retrying…" : "Retry processing"}
            </Button>
          </>
        }
      />

      {/* The specifics that make the message actionable, when the worker
          recorded any — which files, which ids. */}
      {detail && Object.keys(detail).length > 0 && (
        <Panel variant="sunken">
          <PanelContent className="pt-4">
            <dl className="space-y-2 text-sm">
              {Object.entries(detail).map(([key, value]) => (
                <div key={key} className="flex gap-3">
                  <dt className="w-40 shrink-0 text-muted-foreground">{key}</dt>
                  <dd className="min-w-0 font-mono text-xs break-words">
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </PanelContent>
        </Panel>
      )}

      <p className="text-sm text-muted-foreground">
        The archive is still stored, so retrying re-processes it without
        uploading again.
      </p>
    </div>
  );
}

export type { JobSnapshot };
