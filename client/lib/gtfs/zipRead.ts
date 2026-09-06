/**
 * Reading one small entry out of a zip without decompressing the archive.
 *
 * Split from `zipIndex.ts` because this needs fflate; the index reader stays
 * dependency-free so Node tests can import it.
 */

import { inflateSync } from "fflate";
import { readEntryDataRange, type ZipEntry } from "./zipIndex";

/** Guard: preflight only ever wants tiny metadata files. */
const DEFAULT_MAX_BYTES = 1024 * 1024;

export async function readZipEntryText(
  blob: Blob,
  entry: ZipEntry,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<string | null> {
  if (entry.uncompressedSize > maxBytes) return null;
  if (entry.method !== 0 && entry.method !== 8) return null;

  const range = await readEntryDataRange(blob, entry);
  if (!range) return null;

  const raw = new Uint8Array(await blob.slice(range.start, range.end).arrayBuffer());
  let bytes: Uint8Array;
  try {
    bytes =
      entry.method === 0
        ? raw
        : inflateSync(raw, { out: new Uint8Array(entry.uncompressedSize) });
  } catch {
    return null;
  }

  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
