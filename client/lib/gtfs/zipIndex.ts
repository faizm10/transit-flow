/**
 * Minimal ZIP central-directory reader.
 *
 * Lets the browser answer "does this zip actually contain a GTFS feed?" before
 * uploading 100MB to object storage. It reads only the tail of the file (the
 * end-of-central-directory record plus the directory itself), so cost is a few
 * hundred KB regardless of feed size, and nothing is decompressed here.
 *
 * Dependency-free on purpose — the worker package's tests import it directly.
 * Decompressing an individual entry lives in `zipRead.ts` (needs fflate).
 */

export interface ZipEntry {
  /** Normalized to forward slashes, exactly as stored otherwise. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  /** 0 = stored, 8 = deflate. */
  method: number;
}

export type ZipIndexResult =
  | { ok: true; entries: ZipEntry[] }
  | { ok: false; reason: string };

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CDFH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** EOCD is 22 bytes plus a comment of at most 65535. */
const MAX_EOCD_SPAN = 22 + 0xffff;

async function slice(blob: Blob, start: number, end: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer();
  return new DataView(buf);
}

function u64(view: DataView, off: number): number {
  const value = view.getBigUint64(off, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return Number.NaN;
  return Number(value);
}

export async function readZipIndex(blob: Blob): Promise<ZipIndexResult> {
  if (blob.size < 22) return { ok: false, reason: "file is too small to be a zip" };

  const tailLen = Math.min(blob.size, MAX_EOCD_SPAN + 20);
  const tailStart = blob.size - tailLen;
  const tail = await slice(blob, tailStart, blob.size);

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    return { ok: false, reason: "no zip end-of-central-directory record found" };
  }

  let entryCount = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  // Zip64: the 32-bit fields saturate and the real values live in a separate
  // record pointed at by a locator immediately before the EOCD.
  const saturated =
    entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff;
  if (saturated) {
    const locAt = eocd - 20;
    if (locAt < 0 || tail.getUint32(locAt, true) !== EOCD64_LOCATOR_SIG) {
      return { ok: false, reason: "zip64 archive without a locator record" };
    }
    const eocd64Offset = u64(tail, locAt + 8);
    if (!Number.isFinite(eocd64Offset)) {
      return { ok: false, reason: "zip64 offsets exceed the supported range" };
    }
    const rec = await slice(blob, eocd64Offset, Math.min(eocd64Offset + 56, blob.size));
    if (rec.byteLength < 56 || rec.getUint32(0, true) !== EOCD64_SIG) {
      return { ok: false, reason: "zip64 end-of-central-directory record is malformed" };
    }
    entryCount = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOffset = u64(rec, 48);
  }

  if (
    !Number.isFinite(entryCount) ||
    !Number.isFinite(cdSize) ||
    !Number.isFinite(cdOffset) ||
    cdOffset + cdSize > blob.size
  ) {
    return { ok: false, reason: "zip central directory is out of bounds" };
  }

  const cd = await slice(blob, cdOffset, cdOffset + cdSize);
  const entries: ZipEntry[] = [];
  let p = 0;
  const decoder = new TextDecoder("utf-8");

  while (p + 46 <= cd.byteLength && entries.length < entryCount) {
    if (cd.getUint32(p, true) !== CDFH_SIG) {
      return { ok: false, reason: "zip central directory entry is malformed" };
    }
    const method = cd.getUint16(p + 10, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let uncompressedSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localHeaderOffset = cd.getUint32(p + 42, true);

    const nameStart = p + 46;
    const name = decoder
      .decode(new Uint8Array(cd.buffer, cd.byteOffset + nameStart, nameLen))
      .replace(/\\/g, "/");

    // Zip64 extended information: only the saturated fields are present, in a
    // fixed order (uncompressed, compressed, local header offset, disk).
    const extraStart = nameStart + nameLen;
    let x = extraStart;
    while (x + 4 <= extraStart + extraLen) {
      const id = cd.getUint16(x, true);
      const size = cd.getUint16(x + 2, true);
      if (id === 0x0001) {
        let f = x + 4;
        if (uncompressedSize === 0xffffffff && f + 8 <= x + 4 + size) {
          uncompressedSize = u64(cd, f);
          f += 8;
        }
        if (compressedSize === 0xffffffff && f + 8 <= x + 4 + size) {
          compressedSize = u64(cd, f);
          f += 8;
        }
        if (localHeaderOffset === 0xffffffff && f + 8 <= x + 4 + size) {
          localHeaderOffset = u64(cd, f);
        }
        break;
      }
      x += 4 + size;
    }

    entries.push({ name, compressedSize, uncompressedSize, localHeaderOffset, method });
    p = extraStart + extraLen + commentLen;
  }

  if (entries.length === 0) return { ok: false, reason: "zip contains no entries" };
  return { ok: true, entries };
}

/**
 * Byte range of an entry's *compressed* payload. The central directory does not
 * record it — the local header carries its own name/extra lengths.
 */
export async function readEntryDataRange(
  blob: Blob,
  entry: ZipEntry
): Promise<{ start: number; end: number } | null> {
  if (entry.localHeaderOffset + 30 > blob.size) return null;
  const head = await slice(blob, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  if (head.getUint32(0, true) !== LFH_SIG) return null;
  const nameLen = head.getUint16(26, true);
  const extraLen = head.getUint16(28, true);
  const start = entry.localHeaderOffset + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > blob.size) return null;
  return { start, end };
}
