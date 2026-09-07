import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db, datasetUploads } from "@/lib/db";
import {
  handle,
  requireOwnedDataset,
  ApiError,
} from "@/lib/datasets/server/access";
import {
  createMultipartUpload,
  presignParts,
  rawArchiveKey,
  isStorageConfigured,
  MAX_ARCHIVE_BYTES,
} from "@/lib/storage/objectStore";
import { formatBytes } from "@/lib/format";

/**
 * Start an upload.
 *
 * The response hands the browser presigned URLs it PUTs to directly. The
 * archive never passes through this function — that is the point, and it is
 * what makes Vercel's ~4.5 MB body limit irrelevant.
 *
 * Only the first batch of part URLs is returned. A long upload refreshes the
 * rest from `PATCH .../uploads/[uploadId]`, so a URL expiring mid-transfer does
 * not force the whole upload to restart.
 */
const FIRST_BATCH_PARTS = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { dataset } = await requireOwnedDataset(id);

    if (!isStorageConfigured()) {
      throw new ApiError(
        503,
        "storage_unavailable",
        "Object storage is not configured on this deployment."
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      filename?: unknown;
      byteSize?: unknown;
      checksumSha256?: unknown;
    };

    // ── Validate the client's claims ────────────────────────────────────────
    // `filename` is display-only and never touches an object key.
    const filename =
      typeof body.filename === "string"
        ? body.filename.split(/[/\\]/).pop()!.slice(0, 255)
        : "";
    if (!filename) {
      throw new ApiError(400, "invalid_filename", "Missing file name");
    }
    if (!/\.zip$/i.test(filename)) {
      throw new ApiError(
        400,
        "invalid_format",
        "GTFS feeds must be uploaded as a .zip archive."
      );
    }

    const byteSize = typeof body.byteSize === "number" ? body.byteSize : NaN;
    if (!Number.isInteger(byteSize) || byteSize <= 0) {
      throw new ApiError(400, "invalid_size", "Missing or invalid file size");
    }
    if (byteSize > MAX_ARCHIVE_BYTES) {
      throw new ApiError(
        413,
        "archive_too_large",
        `This archive is ${formatBytes(byteSize)}. The limit is ${formatBytes(MAX_ARCHIVE_BYTES)}.`
      );
    }

    // Client-computed; the worker re-verifies against the stored bytes before
    // trusting it, so this is a fast-fail hint, not a security control.
    const checksumSha256 =
      typeof body.checksumSha256 === "string" &&
      /^[0-9a-f]{64}$/i.test(body.checksumSha256)
        ? body.checksumSha256.toLowerCase()
        : null;

    // ── Supersede any abandoned upload ──────────────────────────────────────
    // A partial unique index allows only one live upload per dataset. Marking
    // the previous one aborted lets a user who closed the tab start over
    // without hitting a constraint violation they cannot act on.
    await db
      .update(datasetUploads)
      .set({ status: "aborted" })
      .where(
        and(
          eq(datasetUploads.datasetId, dataset.id),
          inArray(datasetUploads.status, ["pending", "uploading"])
        )
      );

    const [upload] = await db
      .insert(datasetUploads)
      .values({
        datasetId: dataset.id,
        // Placeholder: the key needs the upload's own id, which we only have
        // after the insert.
        storageKey: `pending:${dataset.id}:${Date.now()}`,
        filename,
        byteSize,
        checksumSha256,
        status: "pending",
      })
      .returning();

    const storageKey = rawArchiveKey(dataset.id, upload.id);
    const created = await createMultipartUpload(storageKey, byteSize);

    await db
      .update(datasetUploads)
      .set({
        storageKey,
        multipartUploadId: created.multipartUploadId,
        partSize: created.partSize,
        partCount: created.partCount,
        status: "uploading",
      })
      .where(eq(datasetUploads.id, upload.id));

    const firstBatch = Array.from(
      { length: Math.min(FIRST_BATCH_PARTS, created.partCount) },
      (_, i) => i + 1
    );

    return NextResponse.json(
      {
        upload: {
          id: upload.id,
          datasetId: dataset.id,
          filename,
          byteSize,
          partSize: created.partSize,
          partCount: created.partCount,
          status: "uploading",
        },
        parts: await presignParts(
          storageKey,
          created.multipartUploadId,
          firstBatch
        ),
      },
      { status: 201 }
    );
  });
}
