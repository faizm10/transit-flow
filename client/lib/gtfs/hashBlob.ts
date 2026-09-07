/**
 * Chunked SHA-256 of a Blob, with progress.
 *
 * Shared by the checksum Web Worker and its main-thread fallback, so both
 * report the same digest and the same progress shape.
 */

import { Sha256 } from "./sha256";

export const CHECKSUM_CHUNK_BYTES = 8 * 1024 * 1024;

export interface ChecksumProgress {
  loaded: number;
  total: number;
}

export type ChecksumWorkerMessage =
  | { type: "progress"; loaded: number; total: number }
  | { type: "result"; checksum: string }
  | { type: "error"; message: string };

export async function hashBlob(
  blob: Blob,
  options: { onProgress?: (p: ChecksumProgress) => void; signal?: AbortSignal } = {}
): Promise<string> {
  const { onProgress, signal } = options;
  const hash = new Sha256();
  const total = blob.size;
  let loaded = 0;

  onProgress?.({ loaded: 0, total });
  while (loaded < total) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const end = Math.min(loaded + CHECKSUM_CHUNK_BYTES, total);
    const buf = await blob.slice(loaded, end).arrayBuffer();
    hash.update(new Uint8Array(buf));
    loaded = end;
    onProgress?.({ loaded, total });
  }
  return hash.digestHex();
}
