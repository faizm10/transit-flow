import "server-only";

import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage — the data plane.
 *
 * S3-compatible, so the same code runs against MinIO locally and Cloudflare R2
 * or AWS S3 in production. Raw archives and derived artifacts live here; the
 * database stores keys, never bytes.
 *
 * Two endpoints, and they are not interchangeable:
 *
 *   S3_ENDPOINT         reachable from the server/worker (`http://minio:9000`
 *                       inside compose, the provider URL in production)
 *   S3_PUBLIC_ENDPOINT  reachable from the *browser* (`http://127.0.0.1:9000`)
 *
 * Presigned URLs handed to a browser must be signed against the public
 * endpoint, or the signature will be valid for a host the browser cannot
 * resolve. In production both are usually the same value.
 */

// ── Limits ──────────────────────────────────────────────────────────────────

/**
 * S3 multipart requires every part except the last to be ≥ 5 MB, and allows at
 * most 10,000 parts. 16 MB parts put the ceiling at 160 GB, well past anything
 * a GTFS feed will reach, while keeping a failed part cheap to retry.
 */
export const MIN_PART_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PART_BYTES = 16 * 1024 * 1024;
export const MAX_PARTS = 10_000;

/** Presigned URLs are short-lived; the client re-requests them when resuming. */
const PRESIGN_TTL_SECONDS = 60 * 60;

/** Hard ceiling on an accepted archive. Enforced before a key is ever issued. */
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

// ── Client ──────────────────────────────────────────────────────────────────

export class StorageNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Object storage is not configured. Missing: ${missing.join(", ")}. ` +
        `See docs/architecture/01-ingestion.md for local setup.`
    );
    this.name = "StorageNotConfiguredError";
  }
}

function requireEnv(): {
  bucket: string;
  region: string;
  endpoint: string;
  publicEndpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
} {
  const env = {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => `S3_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  if (missing.length > 0) throw new StorageNotConfiguredError(missing);

  return {
    bucket: env.bucket!,
    region: env.region,
    endpoint: env.endpoint!,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? env.endpoint!,
    accessKeyId: env.accessKeyId!,
    secretAccessKey: env.secretAccessKey!,
    // MinIO needs path-style addressing; R2 and S3 do not.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

/** True when storage is configured, so callers can degrade instead of throwing. */
export function isStorageConfigured(): boolean {
  try {
    requireEnv();
    return true;
  } catch {
    return false;
  }
}

let internalClient: S3Client | null = null;
let browserClient: S3Client | null = null;

/** Client for server-side reads and writes. */
function internal(): S3Client {
  const cfg = requireEnv();
  internalClient ??= new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return internalClient;
}

/** Client used only to sign URLs that a browser will call. */
function forBrowser(): S3Client {
  const cfg = requireEnv();
  browserClient ??= new S3Client({
    region: cfg.region,
    endpoint: cfg.publicEndpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return browserClient;
}

function bucket(): string {
  return requireEnv().bucket;
}

// ── Keys ────────────────────────────────────────────────────────────────────

/**
 * Object keys are server-generated from ids we control. A client-supplied
 * filename never reaches a key — that is the whole path-traversal class of bug,
 * and it also means two users uploading `gtfs.zip` cannot collide.
 */
export function rawArchiveKey(datasetId: string, uploadId: string): string {
  return `datasets/${datasetId}/uploads/${uploadId}/archive.zip`;
}

export function artifactPrefix(datasetId: string): string {
  return `datasets/${datasetId}/artifacts`;
}

export function artifactKey(datasetId: string, name: string): string {
  // Defence in depth: reject anything that could escape the prefix even though
  // `name` is always internally generated today.
  if (name.includes("..") || name.startsWith("/")) {
    throw new Error(`Unsafe artifact name: ${name}`);
  }
  return `${artifactPrefix(datasetId)}/${name}`;
}

// ── Multipart upload ────────────────────────────────────────────────────────

/**
 * Choose a part size that keeps the part count under the S3 limit.
 * Doubles from the default until `byteSize / partSize` fits.
 */
export function choosePartSize(byteSize: number): number {
  let partSize = DEFAULT_PART_BYTES;
  while (Math.ceil(byteSize / partSize) > MAX_PARTS) partSize *= 2;
  return partSize;
}

export interface CreatedMultipartUpload {
  key: string;
  multipartUploadId: string;
  partSize: number;
  partCount: number;
}

export async function createMultipartUpload(
  key: string,
  byteSize: number
): Promise<CreatedMultipartUpload> {
  const partSize = choosePartSize(byteSize);
  const result = await internal().send(
    new CreateMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      // Archives are opaque to us until the worker validates them. Declaring a
      // generic binary type keeps the store from ever serving one as HTML.
      ContentType: "application/octet-stream",
    })
  );

  if (!result.UploadId) {
    throw new Error("Storage did not return a multipart upload id");
  }

  return {
    key,
    multipartUploadId: result.UploadId,
    partSize,
    partCount: Math.max(1, Math.ceil(byteSize / partSize)),
  };
}

/**
 * Presign a batch of part URLs for the browser to PUT directly.
 *
 * Signed against the *public* endpoint. Returned in batches rather than all at
 * once so a long upload can refresh expired URLs without re-creating the
 * multipart upload.
 */
export async function presignParts(
  key: string,
  multipartUploadId: string,
  partNumbers: number[]
): Promise<{ partNumber: number; url: string }[]> {
  const client = forBrowser();
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket(),
          Key: key,
          UploadId: multipartUploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PRESIGN_TTL_SECONDS }
      ),
    }))
  );
}

/**
 * Parts the store has actually received.
 *
 * This — not what the client remembers sending — is the authority when
 * resuming. A part the browser thinks it sent but the store never committed
 * has to be sent again.
 */
export async function listUploadedParts(
  key: string,
  multipartUploadId: string
): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  let marker: number | undefined;

  do {
    const page = await internal().send(
      new ListPartsCommand({
        Bucket: bucket(),
        Key: key,
        UploadId: multipartUploadId,
        PartNumberMarker: marker?.toString(),
      })
    );
    for (const part of page.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({
          partNumber: part.PartNumber,
          etag: part.ETag,
          size: part.Size ?? 0,
        });
      }
    }
    marker = page.IsTruncated
      ? Number(page.NextPartNumberMarker) || undefined
      : undefined;
  } while (marker !== undefined);

  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export async function completeMultipartUpload(
  key: string,
  multipartUploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  await internal().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: multipartUploadId,
      MultipartUpload: {
        // S3 requires ascending part numbers.
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

/** Cancel an upload and release the parts the store is holding. */
export async function abortMultipartUpload(
  key: string,
  multipartUploadId: string
): Promise<void> {
  await internal().send(
    new AbortMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: multipartUploadId,
    })
  );
}

// ── Objects ─────────────────────────────────────────────────────────────────

export async function headObject(
  key: string
): Promise<{ byteSize: number; etag?: string } | null> {
  try {
    const result = await internal().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return { byteSize: result.ContentLength ?? 0, etag: result.ETag };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw error;
  }
}

/**
 * Stream an object. Returns a web `ReadableStream` so the worker can pipe it
 * through the zip reader without ever holding the archive in memory.
 */
export async function getObjectStream(
  key: string
): Promise<ReadableStream<Uint8Array>> {
  const result = await internal().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key })
  );
  if (!result.Body) throw new Error(`Object has no body: ${key}`);
  return result.Body.transformToWebStream();
}

/** Presigned GET, for handing a browser a derived artifact without proxying it. */
export async function presignGet(
  key: string,
  expiresIn = PRESIGN_TTL_SECONDS
): Promise<string> {
  return getSignedUrl(
    forBrowser(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn }
  );
}

/**
 * Delete everything under a prefix. Used when a dataset is deleted outright —
 * archival keeps artifacts, so it does not call this.
 */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await internal().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    const keys = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));

    if (keys.length > 0) {
      await internal().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        })
      );
      deleted += keys.length;
    }
    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return deleted;
}
