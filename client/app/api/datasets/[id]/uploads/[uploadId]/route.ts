import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, datasetUploads, type DatasetUpload } from "@/lib/db";
import {
  handle,
  requireOwnedDataset,
  ApiError,
  isUuid,
} from "@/lib/datasets/server/access";
import {
  abortMultipartUpload,
  listUploadedParts,
  presignParts,
} from "@/lib/storage/objectStore";

/** How many presigned part URLs one refresh hands out. */
const BATCH_PARTS = 20;

async function loadUpload(
  datasetId: string,
  uploadId: string
): Promise<DatasetUpload> {
  if (!isUuid(uploadId)) {
    throw new ApiError(404, "not_found", "Upload not found");
  }
  const [upload] = await db
    .select()
    .from(datasetUploads)
    .where(
      and(
        eq(datasetUploads.id, uploadId),
        eq(datasetUploads.datasetId, datasetId)
      )
    )
    .limit(1);
  if (!upload) throw new ApiError(404, "not_found", "Upload not found");
  return upload;
}

// ── GET — resume state ──────────────────────────────────────────────────────
/**
 * What the browser asks on resume: which parts does the store already hold?
 *
 * The answer comes from the store, not from what the client remembers sending.
 * A part the browser believes it uploaded but that was never committed has to
 * go again, and only the store knows which those are.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  return handle(async () => {
    const { id, uploadId } = await params;
    const { dataset } = await requireOwnedDataset(id);
    const upload = await loadUpload(dataset.id, uploadId);

    if (!upload.multipartUploadId || upload.status !== "uploading") {
      return NextResponse.json({
        upload: publicUpload(upload),
        uploadedParts: [],
        parts: [],
      });
    }

    const uploaded = await listUploadedParts(
      upload.storageKey,
      upload.multipartUploadId
    );
    const done = new Set(uploaded.map((p) => p.partNumber));

    const remaining: number[] = [];
    for (let n = 1; n <= (upload.partCount ?? 0); n++) {
      if (!done.has(n)) remaining.push(n);
      if (remaining.length >= BATCH_PARTS) break;
    }

    // Keep the recorded parts in step with the store, so `complete` can be
    // served without a second round trip.
    await db
      .update(datasetUploads)
      .set({ parts: uploaded })
      .where(eq(datasetUploads.id, upload.id));

    return NextResponse.json({
      upload: publicUpload(upload),
      uploadedParts: uploaded,
      parts: await presignParts(
        upload.storageKey,
        upload.multipartUploadId,
        remaining
      ),
    });
  });
}

// ── PATCH — more presigned URLs ─────────────────────────────────────────────
/**
 * Refresh part URLs mid-upload. Presigned URLs expire in an hour; a
 * multi-gigabyte transfer on a slow connection outlives that, and re-signing is
 * far cheaper than restarting.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  return handle(async () => {
    const { id, uploadId } = await params;
    const { dataset } = await requireOwnedDataset(id);
    const upload = await loadUpload(dataset.id, uploadId);

    if (!upload.multipartUploadId) {
      throw new ApiError(409, "upload_not_active", "This upload is not active");
    }

    const body = (await req.json().catch(() => ({}))) as {
      partNumbers?: unknown;
    };
    const partCount = upload.partCount ?? 0;
    const requested = Array.isArray(body.partNumbers)
      ? body.partNumbers
          .filter(
            (n): n is number =>
              Number.isInteger(n) && (n as number) >= 1 && (n as number) <= partCount
          )
          .slice(0, BATCH_PARTS)
      : [];

    if (requested.length === 0) {
      throw new ApiError(400, "invalid_parts", "No valid part numbers requested");
    }

    return NextResponse.json({
      parts: await presignParts(
        upload.storageKey,
        upload.multipartUploadId,
        requested
      ),
    });
  });
}

// ── DELETE — cancel ─────────────────────────────────────────────────────────
/**
 * Cancel an in-flight upload. Aborting at the store side matters: without it
 * the uploaded parts sit in the bucket indefinitely, billed and invisible.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  return handle(async () => {
    const { id, uploadId } = await params;
    const { dataset } = await requireOwnedDataset(id);
    const upload = await loadUpload(dataset.id, uploadId);

    if (upload.multipartUploadId && upload.status !== "completed") {
      // Best effort: if the store has already expired the upload, the row still
      // needs to move to `aborted`.
      await abortMultipartUpload(
        upload.storageKey,
        upload.multipartUploadId
      ).catch(() => {});
    }

    await db
      .update(datasetUploads)
      .set({ status: "aborted" })
      .where(eq(datasetUploads.id, upload.id));

    return NextResponse.json({ ok: true });
  });
}

function publicUpload(upload: DatasetUpload) {
  return {
    id: upload.id,
    datasetId: upload.datasetId,
    filename: upload.filename,
    byteSize: upload.byteSize,
    partSize: upload.partSize,
    partCount: upload.partCount,
    status: upload.status,
  };
}
