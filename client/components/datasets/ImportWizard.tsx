"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileArchive, Info, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Status } from "@/components/ui/status";
import { preflightGtfsArchive, type PreflightResult } from "@/lib/gtfs/preflight";
import {
  cancelUpload,
  uploadGtfsArchive,
  UploadCancelledError,
  type UploadProgress,
} from "@/lib/upload/resumableUpload";
import {
  formatBytes,
  formatBytesPerSecond,
  formatDuration,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The import flow.
 *
 * Four steps, only one visible at a time: choose a file, check it, name it,
 * upload. Progressive disclosure rather than a form with every field at once —
 * most of what we would ask for, we can read out of the archive.
 *
 * Uploading and processing are strictly separate. This component's job ends
 * when the bytes are in storage and a job is queued; the processing screen
 * takes over from there, because they measure different work and merging their
 * progress into one bar would be a lie about both.
 */

type Phase = "choose" | "checking" | "ready" | "uploading" | "done";

export function ImportWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadIdRef = useRef<{ datasetId: string; uploadId: string } | null>(null);

  const [phase, setPhase] = useState<Phase>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [checksumPct, setChecksumPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("choose");
    setFile(null);
    setPreflight(null);
    setProgress(null);
    setChecksumPct(null);
    setError(null);
  }, []);

  const chooseFile = useCallback(async (chosen: File) => {
    setError(null);
    setFile(chosen);
    setPhase("checking");

    // Reading the zip's index costs a few hundred KB and a couple of
    // milliseconds, and it means a bad archive is rejected now rather than
    // after a multi-gigabyte upload.
    const result = await preflightGtfsArchive(chosen);
    setPreflight(result);

    // Prefill from agency.txt when we could read it — one fewer thing to type,
    // and the name a user would have typed anyway.
    setName((current) =>
      current || result.agencyName || chosen.name.replace(/\.zip$/i, "")
    );
    setPhase(result.ok ? "ready" : "choose");
  }, []);

  const start = useCallback(async () => {
    if (!file || !name.trim()) return;

    setError(null);
    setPhase("uploading");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1. Create the dataset.
      const createRes = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const created = (await createRes.json()) as {
        dataset?: { id: string };
        error?: { message?: string };
      };
      if (!createRes.ok || !created.dataset) {
        throw new Error(created.error?.message ?? "Could not create the dataset");
      }
      const datasetId = created.dataset.id;

      // 2. Checksum, off the main thread. The server re-verifies this against
      //    the stored bytes, so a corrupted transfer is caught before parsing
      //    rather than surfacing as a baffling CSV error.
      const checksum = await hashInWorker(file, (pct) => setChecksumPct(pct));
      setChecksumPct(null);

      // 3. Upload directly to storage.
      await uploadGtfsArchive({
        file,
        datasetId,
        checksumSha256: checksum,
        signal: controller.signal,
        onSession: (session) => {
          uploadIdRef.current = { datasetId, uploadId: session.id };
        },
        onProgress: setProgress,
      });

      setPhase("done");
      // The dataset page decides what to show next — processing or overview.
      router.push(`/datasets/${datasetId}`);
    } catch (caught) {
      if (caught instanceof UploadCancelledError) {
        setPhase("ready");
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The upload failed. Please try again."
      );
      setPhase("ready");
    } finally {
      abortRef.current = null;
    }
  }, [file, name, router]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    const session = uploadIdRef.current;
    if (session) {
      // Release the parts the store is holding; otherwise they linger, billed
      // and invisible.
      void cancelUpload(session.datasetId, session.uploadId);
      uploadIdRef.current = null;
    }
    setProgress(null);
    setPhase("ready");
  }, []);

  // ── Upload in progress ───────────────────────────────────────────────────
  if (phase === "uploading" || phase === "done") {
    return (
      <UploadProgressView
        filename={file?.name ?? ""}
        name={name}
        progress={progress}
        checksumPct={checksumPct}
        done={phase === "done"}
        onCancel={cancel}
      />
    );
  }

  // ── Choose / confirm ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="dataset-name">Dataset name</Label>
        <Input
          id="dataset-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="GO Transit — Autumn 2026"
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gtfs-file">GTFS archive</Label>

        {file && preflight?.ok ? (
          <SelectedFile
            file={file}
            preflight={preflight}
            onClear={reset}
          />
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) void chooseFile(dropped);
            }}
            className={cn(
              "rounded-xl border border-dashed px-6 py-10 text-center transition-colors duration-150",
              dragging
                ? "border-brand bg-brand-subtle"
                : "border-border bg-surface-sunken"
            )}
          >
            <FileArchive className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              Drop a GTFS .zip file here
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-brand underline underline-offset-4 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                browse files
              </button>
            </p>
            {phase === "checking" && (
              <p className="mt-3 text-xs text-muted-foreground">
                Checking the archive…
              </p>
            )}
            <input
              ref={inputRef}
              id="gtfs-file"
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) void chooseFile(chosen);
                // Allow re-selecting the same file after a reset.
                event.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {preflight && preflight.problems.length > 0 && (
        <ProblemList problems={preflight.problems} />
      )}

      {error && (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={start}
          disabled={!file || !preflight?.ok || !name.trim() || phase === "checking"}
        >
          <Upload />
          Import feed
        </Button>
        <p className="text-xs text-muted-foreground">
          Uploads go directly to storage. Interrupted transfers resume rather
          than restarting.
        </p>
      </div>
    </div>
  );
}

function SelectedFile({
  file,
  preflight,
  onClear,
}: {
  file: File;
  preflight: PreflightResult;
  onClear: () => void;
}) {
  return (
    <Panel variant="sunken">
      <PanelContent className="flex items-start gap-3 pt-4">
        <FileArchive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBytes(file.size)}
            {preflight.entryCount > 0 && ` · ${preflight.entryCount} files`}
            {preflight.totalUncompressedBytes > 0 &&
              ` · ${formatBytes(preflight.totalUncompressedBytes)} uncompressed`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Remove file">
          <X />
        </Button>
      </PanelContent>
    </Panel>
  );
}

function ProblemList({
  problems,
}: {
  problems: PreflightResult["problems"];
}) {
  return (
    <ul className="space-y-2">
      {problems.map((problem) => (
        <li
          key={problem.code}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
            problem.severity === "error"
              ? "bg-danger-subtle text-danger"
              : "bg-warning-subtle text-warning"
          )}
        >
          {problem.severity === "error" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="min-w-0">{problem.message}</span>
        </li>
      ))}
    </ul>
  );
}

function UploadProgressView({
  filename,
  name,
  progress,
  checksumPct,
  done,
  onCancel,
}: {
  filename: string;
  name: string;
  progress: UploadProgress | null;
  checksumPct: number | null;
  done: boolean;
  onCancel: () => void;
}) {
  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.uploadedBytes / progress.totalBytes) * 100)
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-medium">{name}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{filename}</p>
      </div>

      {checksumPct !== null ? (
        <div className="space-y-2">
          <Status tone="info" pulse>
            Checking file integrity
          </Status>
          <Progress value={checksumPct} />
          <p className="text-xs text-muted-foreground">{checksumPct}%</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Status tone={done ? "success" : "info"} pulse={!done}>
            {done ? "Upload complete" : "Uploading"}
          </Status>
          <Progress value={done ? 100 : pct} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {pct !== null && <span>{pct}%</span>}
            {progress && (
              <span>
                {formatBytes(progress.uploadedBytes)} of{" "}
                {formatBytes(progress.totalBytes)}
              </span>
            )}
            {progress?.bytesPerSecond && (
              <span>{formatBytesPerSecond(progress.bytesPerSecond)}</span>
            )}
            {progress?.etaSeconds != null && (
              <span>{formatDuration(progress.etaSeconds * 1000)} left</span>
            )}
            {progress && progress.totalParts > 1 && (
              <span>
                part {progress.completedParts} of {progress.totalParts}
              </span>
            )}
          </div>
        </div>
      )}

      {!done && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel upload
        </Button>
      )}
    </div>
  );
}

/**
 * SHA-256 in a Web Worker, so hashing a large archive does not freeze the page.
 *
 * Falls back to the main thread if a worker cannot start — the digest still
 * has to be computed, and a brief freeze beats failing the import.
 */
function hashInWorker(
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../../lib/workers/gtfsChecksum.worker.ts", import.meta.url)
      );
    } catch {
      void import("@/lib/gtfs/hashBlob")
        .then(({ hashBlob }) =>
          hashBlob(file, {
            onProgress: ({ loaded, total }) =>
              onProgress(Math.round((loaded / total) * 100)),
          })
        )
        .then(resolve, reject);
      return;
    }

    worker.onmessage = (
      event: MessageEvent<
        | { type: "progress"; loaded: number; total: number }
        | { type: "result"; checksum: string }
        | { type: "error"; message: string }
      >
    ) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(Math.round((message.loaded / message.total) * 100));
      } else if (message.type === "result") {
        worker.terminate();
        resolve(message.checksum);
      } else {
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Could not check the file"));
    };
    worker.postMessage({ file });
  });
}
