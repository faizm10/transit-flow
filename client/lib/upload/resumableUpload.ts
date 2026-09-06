/**
 * Resumable multipart upload, browser side.
 *
 * The archive goes straight from the file input to object storage over
 * presigned URLs. It never touches a Next.js route, so Vercel's ~4.5 MB body
 * limit and function timeout are simply not in the path.
 *
 * `XMLHttpRequest`, not `fetch`, because only XHR exposes upload progress
 * events. `fetch` can stream a request body but reports nothing about how much
 * of it has gone out, and honest byte-level progress is the requirement here.
 *
 * Design points:
 *  - Parts upload with bounded concurrency. Serial wastes bandwidth; unbounded
 *    starves the connection and makes progress lurch.
 *  - A part slice is a `Blob` view, not a copy. Reading a 2 GB file into memory
 *    to upload it would defeat the whole design.
 *  - Failed parts retry individually with backoff. One flaky part must not cost
 *    the whole transfer.
 *  - Presigned URLs expire in an hour; a slow upload refreshes them mid-flight.
 *  - Resume asks the *server* which parts landed, because the client's belief
 *    about what it sent is exactly what a crash invalidates.
 */

const MAX_CONCURRENT_PARTS = 4;
const MAX_PART_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;

export interface UploadProgress {
  /** Bytes confirmed accepted by the store, plus in-flight partial progress. */
  uploadedBytes: number;
  totalBytes: number;
  /** Smoothed transfer rate, or null before there is enough signal. */
  bytesPerSecond: number | null;
  /** Seconds remaining, or null when the rate is not yet meaningful. */
  etaSeconds: number | null;
  completedParts: number;
  totalParts: number;
}

export interface UploadSession {
  id: string;
  datasetId: string;
  partSize: number;
  partCount: number;
}

interface PresignedPart {
  partNumber: number;
  url: string;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "UploadError";
  }
}

async function apiJson<T>(
  input: string,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  } & T;

  if (!res.ok) {
    throw new UploadError(
      body.error?.message ?? `Request failed (${res.status})`,
      body.error?.code ?? "request_failed",
      // 5xx and 429 are worth another go; a 4xx means the request itself is
      // wrong and retrying changes nothing.
      res.status >= 500 || res.status === 429
    );
  }
  return body;
}

/**
 * Rolling transfer-rate estimate.
 *
 * A window rather than a cumulative average: a cumulative rate keeps reporting
 * the speed of a connection that has since changed, so the ETA lies for minutes
 * after a slowdown.
 */
class RateEstimator {
  private samples: { at: number; bytes: number }[] = [];
  private readonly windowMs = 8_000;

  record(totalBytes: number): void {
    const at = Date.now();
    this.samples.push({ at, bytes: totalBytes });
    while (this.samples.length > 2 && at - this.samples[0].at > this.windowMs) {
      this.samples.shift();
    }
  }

  rate(): number | null {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsed = (last.at - first.at) / 1000;
    // Under a second of history is noise, not a measurement.
    if (elapsed < 1) return null;
    const delta = last.bytes - first.bytes;
    return delta > 0 ? delta / elapsed : null;
  }
}

/** PUT one part, resolving to its ETag. */
function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onBytes: (loaded: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadCancelledError());

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);

    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });

    const settle = (fn: () => void) => {
      signal.removeEventListener("abort", abort);
      fn();
    };

    xhr.upload.onprogress = (event) => onBytes(event.loaded);

    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // S3 returns the part's ETag here; without it the upload cannot be
          // completed. A missing header usually means CORS is not exposing it.
          const etag = xhr.getResponseHeader("ETag");
          if (!etag) {
            reject(
              new UploadError(
                "Storage did not return an ETag for this part. The bucket's CORS configuration must expose the ETag header.",
                "missing_etag",
                false
              )
            );
            return;
          }
          resolve(etag);
        } else {
          reject(
            new UploadError(
              `Part upload failed (${xhr.status})`,
              "part_failed",
              xhr.status >= 500 || xhr.status === 0
            )
          );
        }
      });

    xhr.onerror = () =>
      settle(() =>
        reject(new UploadError("Network error", "network_error", true))
      );
    xhr.ontimeout = () =>
      settle(() => reject(new UploadError("Timed out", "timeout", true)));
    xhr.onabort = () => settle(() => reject(new UploadCancelledError()));

    xhr.send(body);
  });
}

export interface UploadOptions {
  file: File;
  datasetId: string;
  /** Hex SHA-256, computed by the caller before starting. */
  checksumSha256?: string;
  /** Resume this upload instead of starting a new one. */
  resumeUploadId?: string;
  onProgress?: (progress: UploadProgress) => void;
  onSession?: (session: UploadSession) => void;
  signal?: AbortSignal;
}

/**
 * Upload `file` and queue it for processing.
 *
 * Resolves with the ingestion job once the archive is stored and enqueued.
 */
export async function uploadGtfsArchive({
  file,
  datasetId,
  checksumSha256,
  resumeUploadId,
  onProgress,
  onSession,
  signal,
}: UploadOptions): Promise<{ jobId: string; uploadId: string }> {
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const { signal: abortSignal } = controller;

  const throwIfCancelled = () => {
    if (abortSignal.aborted) throw new UploadCancelledError();
  };

  // ── Session: start or resume ──────────────────────────────────────────────
  let session: UploadSession;
  let pending: PresignedPart[];
  let completed: { partNumber: number; size: number }[] = [];

  if (resumeUploadId) {
    const state = await apiJson<{
      upload: UploadSession & { partSize: number; partCount: number };
      uploadedParts: { partNumber: number; size: number }[];
      parts: PresignedPart[];
    }>(`/api/datasets/${datasetId}/uploads/${resumeUploadId}`);

    session = {
      id: state.upload.id,
      datasetId,
      partSize: state.upload.partSize,
      partCount: state.upload.partCount,
    };
    completed = state.uploadedParts;
    pending = state.parts;
  } else {
    const created = await apiJson<{
      upload: UploadSession & { partSize: number; partCount: number };
      parts: PresignedPart[];
    }>(`/api/datasets/${datasetId}/uploads`, {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        byteSize: file.size,
        checksumSha256,
      }),
    });

    session = {
      id: created.upload.id,
      datasetId,
      partSize: created.upload.partSize,
      partCount: created.upload.partCount,
    };
    pending = created.parts;
  }

  onSession?.(session);

  // ── Transfer ──────────────────────────────────────────────────────────────
  const doneParts = new Set(completed.map((p) => p.partNumber));
  // Bytes the store has confirmed. In-flight parts contribute separately, so a
  // part that fails and retries cannot make the progress bar go backwards.
  let settledBytes = completed.reduce((sum, p) => sum + p.size, 0);
  const inFlight = new Map<number, number>();
  const rate = new RateEstimator();

  const report = () => {
    const uploadedBytes =
      settledBytes + [...inFlight.values()].reduce((a, b) => a + b, 0);
    rate.record(uploadedBytes);
    const bytesPerSecond = rate.rate();
    const remaining = file.size - uploadedBytes;
    onProgress?.({
      uploadedBytes,
      totalBytes: file.size,
      bytesPerSecond,
      etaSeconds:
        bytesPerSecond && remaining > 0 ? remaining / bytesPerSecond : null,
      completedParts: doneParts.size,
      totalParts: session.partCount,
    });
  };

  report();

  /** Presigned URLs, refilled from the API as the queue drains. */
  const urls = new Map(pending.map((p) => [p.partNumber, p.url]));

  const remainingParts: number[] = [];
  for (let n = 1; n <= session.partCount; n++) {
    if (!doneParts.has(n)) remainingParts.push(n);
  }

  async function urlFor(partNumber: number): Promise<string> {
    const known = urls.get(partNumber);
    if (known) return known;

    // Refill in a batch — one request per part would triple the round trips on
    // a large upload.
    const batch = remainingParts
      .filter((n) => !urls.has(n) && !doneParts.has(n))
      .slice(0, 20);
    const refreshed = await apiJson<{ parts: PresignedPart[] }>(
      `/api/datasets/${datasetId}/uploads/${session.id}`,
      { method: "PATCH", body: JSON.stringify({ partNumbers: batch }) }
    );
    for (const part of refreshed.parts) urls.set(part.partNumber, part.url);

    const url = urls.get(partNumber);
    if (!url) {
      throw new UploadError(
        `Could not obtain an upload URL for part ${partNumber}`,
        "presign_failed",
        true
      );
    }
    return url;
  }

  async function uploadPart(partNumber: number): Promise<void> {
    const start = (partNumber - 1) * session.partSize;
    // A Blob slice is a view, not a copy — the bytes are read from disk as they
    // are sent.
    const chunk = file.slice(start, Math.min(start + session.partSize, file.size));

    for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt++) {
      throwIfCancelled();
      try {
        const url = await urlFor(partNumber);
        await putPart(url, chunk, abortSignal, (loaded) => {
          inFlight.set(partNumber, loaded);
          report();
        });

        inFlight.delete(partNumber);
        settledBytes += chunk.size;
        doneParts.add(partNumber);
        report();
        return;
      } catch (error) {
        inFlight.delete(partNumber);
        report();

        if (error instanceof UploadCancelledError) throw error;
        const retryable =
          !(error instanceof UploadError) || error.retryable;
        if (!retryable || attempt === MAX_PART_ATTEMPTS) throw error;

        // A stale presigned URL is a common cause; drop it so the retry
        // re-signs rather than replaying the same expired URL.
        urls.delete(partNumber);
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BASE_MS * 2 ** (attempt - 1))
        );
      }
    }
  }

  // Bounded-concurrency worker pool over the remaining parts.
  const queue = [...remainingParts];
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_PARTS, queue.length) },
    async () => {
      for (;;) {
        const partNumber = queue.shift();
        if (partNumber === undefined) return;
        await uploadPart(partNumber);
      }
    }
  );

  try {
    await Promise.all(workers);
  } catch (error) {
    // Stop the other workers as soon as one fails, so a doomed upload does not
    // keep pushing bytes.
    controller.abort();
    throw error;
  }

  throwIfCancelled();

  // ── Finalize ──────────────────────────────────────────────────────────────
  const result = await apiJson<{ job: { id: string } }>(
    `/api/datasets/${datasetId}/uploads/${session.id}/complete`,
    { method: "POST" }
  );

  return { jobId: result.job.id, uploadId: session.id };
}

/** Cancel an upload server-side, releasing the parts the store is holding. */
export async function cancelUpload(
  datasetId: string,
  uploadId: string
): Promise<void> {
  await fetch(`/api/datasets/${datasetId}/uploads/${uploadId}`, {
    method: "DELETE",
  }).catch(() => {});
}
