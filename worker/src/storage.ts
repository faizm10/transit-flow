import { GetObjectCommand, HeadObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { config } from "./config.ts";
import type { ByteRangeSource } from "./zip/rangeZip.ts";

/**
 * Object storage access for the worker.
 *
 * Uses the internal endpoint (`S3_ENDPOINT`), which inside docker compose is
 * the service name and is not resolvable from a browser. Presigning happens in
 * the Next.js app, not here.
 */
const client = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key })
    );
    return head.ContentLength ?? null;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw error;
  }
}

/**
 * A range-readable view of a stored object.
 *
 * This is what lets the worker read a zip's central directory without pulling
 * the archive: each `read` is a single ranged GET.
 */
export async function openRangeSource(key: string): Promise<ByteRangeSource> {
  const size = await objectSize(key);
  if (size === null) {
    throw new Error(`Object not found in storage: ${key}`);
  }

  return {
    size,
    async read(start: number, end: number): Promise<Uint8Array> {
      if (start >= end) return new Uint8Array(0);
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.s3.bucket,
          Key: key,
          // HTTP Range is inclusive at both ends.
          Range: `bytes=${start}-${end - 1}`,
        })
      );
      if (!result.Body) throw new Error(`Empty range response for ${key}`);
      return new Uint8Array(await result.Body.transformToByteArray());
    },
  };
}

/** Write a derived artifact. Small enough to buffer; these are indexes, not feeds. */
export async function putArtifact(
  key: string,
  body: Uint8Array | string,
  contentType: string
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
