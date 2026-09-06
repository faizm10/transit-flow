import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, datasetUploads } from "@/lib/db";
import {
  handle,
  requireOwnedDataset,
  ApiError,
  isUuid,
} from "@/lib/datasets/server/access";
import { enqueueIngestion } from "@/lib/datasets/server/queue";
import {
  completeMultipartUpload,
  headObject,
  listUploadedParts,
} from "@/lib/storage/objectStore";
import { formatBytes } from "@/lib/format";

/**
 * Finalize an upload and queue processing.
 *
 * The two are one request on purpose: an upload that finished but was never
 * queued is an invisible failure — the archive is paid for and nothing will
 * ever look at it.
 *
 * Everything here is verified against the *store*, never against what the
 * client says it did.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  return handle(async () => {
    const { id, uploadId } = await params;
    const { dataset } = await requireOwnedDataset(id);

    if (!isUuid(uploadId)) {
      throw new ApiError(404, "not_found", "Upload not found");
    }

    const [upload] = await db
      .select()
      .from(datasetUploads)
      .where(
        and(
          eq(datasetUploads.id, uploadId),
          eq(datasetUploads.datasetId, dataset.id)
        )
      )
      .limit(1);

    if (!upload) throw new ApiError(404, "not_found", "Upload not found");

    // Idempotent: a retried request on an already-completed upload returns the
    // live job rather than erroring, so a flaky network cannot strand a user
    // on a finished upload with no way forward.
    if (upload.status === "completed") {
      const job = await enqueueIngestion({
        datasetId: dataset.id,
        uploadId: upload.id,
      });
      return NextResponse.json({ job, upload: { id: upload.id } });
    }

    if (upload.status === "aborted") {
      throw new ApiError(
        409,
        "upload_aborted",
        "This upload was cancelled. Start a new one."
      );
    }
    if (!upload.multipartUploadId) {
      throw new ApiError(409, "upload_not_active", "This upload is not active");
    }

    // ── Verify every part landed ───────────────────────────────────────────
    const parts = await listUploadedParts(
      upload.storageKey,
      upload.multipartUploadId
    );
    const expected = upload.partCount ?? 0;

    if (parts.length !== expected) {
      const present = new Set(parts.map((p) => p.partNumber));
      const missing: number[] = [];
      for (let n = 1; n <= expected && missing.length < 25; n++) {
        if (!present.has(n)) missing.push(n);
      }
      throw new ApiError(
        409,
        "upload_incomplete",
        `${expected - parts.length} of ${expected} parts are missing. Resume the upload to send them.`,
        { missingParts: missing }
      );
    }

    await completeMultipartUpload(
      upload.storageKey,
      upload.multipartUploadId,
      parts
    );

    // ── Verify the assembled object ────────────────────────────────────────
    const object = await headObject(upload.storageKey);
    if (!object) {
      throw new ApiError(
        502,
        "object_missing",
        "The archive was not found in storage after upload. Try uploading again."
      );
    }
    if (object.byteSize !== upload.byteSize) {
      throw new ApiError(
        409,
        "size_mismatch",
        `The stored archive is ${formatBytes(object.byteSize)} but ${formatBytes(upload.byteSize)} was expected. Upload it again.`
      );
    }

    await db
      .update(datasetUploads)
      .set({ status: "completed", completedAt: new Date(), parts })
      .where(eq(datasetUploads.id, upload.id));

    // The worker re-computes SHA-256 while streaming the archive and compares
    // it against `checksumSha256`. We do not read the object here — that would
    // mean pulling gigabytes through a serverless function to learn something
    // the worker learns for free on its first pass.
    const job = await enqueueIngestion({
      datasetId: dataset.id,
      uploadId: upload.id,
    });

    return NextResponse.json({
      job,
      upload: { id: upload.id, byteSize: object.byteSize },
    });
  });
}
