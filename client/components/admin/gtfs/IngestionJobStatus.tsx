import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { GtfsIngestionJob, GtfsIngestionWorkStage } from "@/lib/gtfsIngestion/types";

const STAGE_LABEL: Record<GtfsIngestionWorkStage, string> = {
  queued: "Queued",
  extracting: "Extracting",
  validating: "Validating",
  processing_routes: "Processing routes",
  processing_schedules: "Processing schedules",
  building_simulation_artifacts: "Building simulation artifacts",
  validating_output: "Validating output",
};

export function IngestionJobStatus({ job }: { job: GtfsIngestionJob | null }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Processing job</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {job
              ? `Job ${job.id} · ${job.stage}`
              : "No job running — start ingestion to create one"}
          </p>
        </div>
      </div>

      <ol className="mt-5 flex flex-col">
        {(job?.stages ?? []).map((run, i, arr) => {
          const done = run.status === "completed";
          const running = run.status === "running";
          const failed = run.status === "failed";
          const skipped = run.status === "skipped";
          const isLast = i === arr.length - 1;
          return (
            <li key={run.stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-6 items-center justify-center rounded-full border ${
                    failed
                      ? "border-red-200 bg-red-50 text-red-600"
                      : done
                        ? "border-green-200 bg-green-50 text-[#007A33]"
                        : running
                          ? "border-[#007A33] bg-white text-[#007A33]"
                          : "border-gray-200 bg-white text-gray-300"
                  }`}
                >
                  {failed ? (
                    <CircleAlert className="size-3.5" aria-hidden />
                  ) : done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : running ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                {isLast ? null : <span className="w-px flex-1 bg-gray-100" aria-hidden />}
              </div>
              <p
                className={`mb-4 text-sm ${
                  skipped
                    ? "text-gray-300 line-through"
                    : failed
                      ? "font-medium text-red-700"
                      : running
                        ? "font-medium text-gray-900"
                        : done
                          ? "text-gray-700"
                          : "text-gray-400"
                }`}
              >
                {STAGE_LABEL[run.stage]}
                <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-gray-400">
                  {run.status}
                </span>
              </p>
            </li>
          );
        })}
        {!job ? (
          <li className="text-sm text-gray-400">Waiting for a job payload.</li>
        ) : null}
      </ol>

      <div
        className={`mt-2 rounded-xl border px-3 py-3 ${
          job?.error
            ? "border-red-100 bg-red-50"
            : "border-dashed border-gray-200 bg-gray-50/80"
        }`}
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
          Errors
        </p>
        {job?.error ? (
          <div className="mt-1">
            <p className="text-sm font-medium text-red-700">{job.error.message}</p>
            <p className="mt-0.5 font-mono text-xs text-red-600/80">
              stage: {job.error.stage}
            </p>
            {job.error.details ? (
              <p className="mt-1 text-xs text-red-700/90">{job.error.details}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-400">No processing errors.</p>
        )}
      </div>
    </section>
  );
}
