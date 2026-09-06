import { Inflate } from "fflate";

import {
  MAX_ARCHIVE_ENTRIES,
  MAX_COMPRESSION_RATIO,
  MAX_UNCOMPRESSED_BYTES,
} from "../../../client/lib/gtfs/spec.ts";

/**
 * Reading a zip out of object storage with HTTP range requests.
 *
 * A zip's index — the central directory — sits at the *end* of the file. That
 * is a gift here: fetch the last few hundred kilobytes, learn the offset and
 * size of every member, and then fetch exactly the members we want, in the
 * order we want.
 *
 * Streaming the archive front-to-back would force us to take files in whatever
 * order the producer wrote them. GTFS import has a dependency order — agency
 * before routes, routes and services before trips, trips before stop_times —
 * and reading in the wrong order means buffering. Random access removes the
 * problem entirely, and never holds more than one inflate window in memory.
 *
 * The zip *parsing* here is separate from `client/lib/gtfs/zipIndex.ts`, which
 * reads from a Blob in the browser. Both implement the same format; this one
 * reads through a range-fetching source and enforces the decompression-bomb
 * limits against real inflated bytes rather than declared sizes.
 */

// ── Source ──────────────────────────────────────────────────────────────────

/** Anything that can serve byte ranges: an S3 object, or a local file in tests. */
export interface ByteRangeSource {
  readonly size: number;
  /** Inclusive start, exclusive end. */
  read(start: number, end: number): Promise<Uint8Array>;
}

// ── Format constants ────────────────────────────────────────────────────────

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CDFH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** EOCD is 22 bytes plus a comment of up to 65,535. */
const MAX_EOCD_SPAN = 22 + 0xffff;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

export interface ZipMember {
  /** Normalized to forward slashes. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  method: number;
}

export class ZipFormatError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "ZipFormatError";
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u64(v: DataView, offset: number): number {
  const value = v.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ZipFormatError(
      "Archive declares a size larger than this runtime can address",
      "zip_size_unrepresentable"
    );
  }
  return Number(value);
}

// ── Central directory ───────────────────────────────────────────────────────

/**
 * Read the archive index.
 *
 * Costs two or three range reads regardless of archive size: the tail, then
 * the central directory itself.
 */
export async function readCentralDirectory(
  source: ByteRangeSource
): Promise<ZipMember[]> {
  if (source.size < 22) {
    throw new ZipFormatError("File is too small to be a zip", "zip_too_small");
  }

  const tailLength = Math.min(source.size, MAX_EOCD_SPAN + 20);
  const tailStart = source.size - tailLength;
  const tail = await source.read(tailStart, source.size);
  const tailView = view(tail);

  // Scan backwards for the EOCD signature — it is the last thing in the file
  // unless there is a trailing comment.
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new ZipFormatError(
      "No zip end-of-central-directory record found. The file is not a zip archive, or it is truncated.",
      "zip_no_eocd"
    );
  }

  let entryCount = tailView.getUint16(eocd + 10, true);
  let directorySize = tailView.getUint32(eocd + 12, true);
  let directoryOffset = tailView.getUint32(eocd + 16, true);

  // Zip64: any field at its 32-bit maximum means the real value lives in the
  // zip64 record. Large GTFS archives reach this.
  if (
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    const locator = eocd - 20;
    if (locator < 0 || tailView.getUint32(locator, true) !== EOCD64_LOCATOR_SIG) {
      throw new ZipFormatError(
        "Archive needs zip64 but has no zip64 locator",
        "zip64_locator_missing"
      );
    }
    const eocd64Offset = u64(tailView, locator + 8);
    const eocd64 = view(await source.read(eocd64Offset, eocd64Offset + 56));
    if (eocd64.getUint32(0, true) !== EOCD64_SIG) {
      throw new ZipFormatError(
        "Zip64 end-of-central-directory record is malformed",
        "zip64_eocd_malformed"
      );
    }
    entryCount = u64(eocd64, 32);
    directorySize = u64(eocd64, 40);
    directoryOffset = u64(eocd64, 48);
  }

  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new ZipFormatError(
      `Archive declares ${entryCount.toLocaleString()} entries, past the ${MAX_ARCHIVE_ENTRIES.toLocaleString()} limit.`,
      "zip_too_many_entries"
    );
  }
  if (directoryOffset + directorySize > source.size) {
    throw new ZipFormatError(
      "Zip central directory extends past the end of the file — the archive is truncated.",
      "zip_truncated"
    );
  }

  const directory = await source.read(
    directoryOffset,
    directoryOffset + directorySize
  );
  return parseCentralDirectory(directory, entryCount);
}

function parseCentralDirectory(
  bytes: Uint8Array,
  entryCount: number
): ZipMember[] {
  const v = view(bytes);
  const members: ZipMember[] = [];
  let offset = 0;

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > bytes.length) {
      throw new ZipFormatError(
        "Zip central directory ended unexpectedly",
        "zip_directory_truncated"
      );
    }
    if (v.getUint32(offset, true) !== CDFH_SIG) {
      throw new ZipFormatError(
        "Zip central directory entry has a bad signature",
        "zip_directory_malformed"
      );
    }

    const method = v.getUint16(offset + 10, true);
    let compressedSize = v.getUint32(offset + 20, true);
    let uncompressedSize = v.getUint32(offset + 24, true);
    const nameLength = v.getUint16(offset + 28, true);
    const extraLength = v.getUint16(offset + 30, true);
    const commentLength = v.getUint16(offset + 32, true);
    let localHeaderOffset = v.getUint32(offset + 42, true);

    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes).replace(/\\/g, "/");

    // Zip64 extended information overrides whichever fields are maxed out, in
    // a fixed order: uncompressed, compressed, local header offset.
    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      const extraStart = offset + 46 + nameLength;
      let p = extraStart;
      const extraEnd = extraStart + extraLength;
      while (p + 4 <= extraEnd) {
        const headerId = v.getUint16(p, true);
        const dataSize = v.getUint16(p + 2, true);
        if (headerId === 0x0001) {
          let q = p + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = u64(v, q);
            q += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = u64(v, q);
            q += 8;
          }
          if (localHeaderOffset === 0xffffffff) {
            localHeaderOffset = u64(v, q);
          }
          break;
        }
        p += 4 + dataSize;
      }
    }

    members.push({
      name,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      method,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return members;
}

// ── Member data ─────────────────────────────────────────────────────────────

/**
 * Where a member's compressed bytes actually begin.
 *
 * The central directory records the offset of the *local header*, whose own
 * name and extra fields have lengths that can differ from the central copy —
 * so the data offset has to be read from the local header itself.
 */
async function memberDataStart(
  source: ByteRangeSource,
  member: ZipMember
): Promise<number> {
  const header = view(
    await source.read(member.localHeaderOffset, member.localHeaderOffset + 30)
  );
  if (header.getUint32(0, true) !== LFH_SIG) {
    throw new ZipFormatError(
      `Local header for ${member.name} has a bad signature`,
      "zip_local_header_malformed"
    );
  }
  const nameLength = header.getUint16(26, true);
  const extraLength = header.getUint16(28, true);
  return member.localHeaderOffset + 30 + nameLength + extraLength;
}

/** How much compressed data to pull per range request. */
const READ_CHUNK_BYTES = 1024 * 1024;

/**
 * Largest decompressed chunk handed downstream.
 *
 * fflate's `Inflate` emits the entire output of one `push` as a single chunk, so
 * without re-chunking, one 1 MB compressed read of highly compressible CSV
 * becomes a single multi-megabyte `Uint8Array` — and then a multi-megabyte JS
 * string inside the CSV reader. Measured on the real GO feed, a 4 MB read
 * produced a 28.8 MB chunk, which is what made "bounded memory" untrue: the
 * real bound was read size × compression ratio, and the ratio can reach 200×.
 *
 * Re-chunking here makes the bound a constant. The slices are *copies*, not
 * `subarray` views, because a view keeps the whole oversized buffer alive —
 * which is the bug this is fixing, not a smaller version of it.
 */
const MAX_OUTPUT_CHUNK_BYTES = 256 * 1024;

/** Split an oversized inflate chunk into bounded copies. */
function* rechunk(chunk: Uint8Array): Generator<Uint8Array> {
  if (chunk.length <= MAX_OUTPUT_CHUNK_BYTES) {
    yield chunk;
    return;
  }
  for (let offset = 0; offset < chunk.length; offset += MAX_OUTPUT_CHUNK_BYTES) {
    const end = Math.min(offset + MAX_OUTPUT_CHUNK_BYTES, chunk.length);
    // slice() copies; subarray() would alias the parent and defeat the point.
    yield chunk.slice(offset, end);
  }
}

export interface InflateLimits {
  /** Running total of inflated bytes across the whole archive. */
  totalUncompressed: number;
}

/**
 * Stream one member's decompressed bytes.
 *
 * Yields `Uint8Array` chunks. Memory stays flat: one 4 MB compressed read plus
 * one inflate window at a time, regardless of whether the member is 2 KB or
 * 2 GB.
 *
 * Bomb limits are enforced here against *actual* inflated output. The declared
 * sizes checked during preflight come from the archive itself and a crafted
 * archive can simply lie about them; these numbers cannot be faked.
 */
export async function* streamMember(
  source: ByteRangeSource,
  member: ZipMember,
  limits: InflateLimits
): AsyncGenerator<Uint8Array> {
  if (member.method !== METHOD_STORE && member.method !== METHOD_DEFLATE) {
    throw new ZipFormatError(
      `${member.name} uses an unsupported compression method (${member.method}). Only stored and deflated entries can be read.`,
      "zip_unsupported_method"
    );
  }

  const start = await memberDataStart(source, member);
  const end = start + member.compressedSize;

  let produced = 0;
  const accountFor = (chunk: Uint8Array) => {
    produced += chunk.length;
    limits.totalUncompressed += chunk.length;

    if (limits.totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new ZipFormatError(
        `Archive expands past the ${(MAX_UNCOMPRESSED_BYTES / 1e9).toFixed(0)} GB limit while being read.`,
        "zip_expands_too_large"
      );
    }
    // Per-member ratio check. A single innocuous-looking member is the classic
    // shape of a decompression bomb.
    if (
      member.compressedSize > 0 &&
      produced / member.compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new ZipFormatError(
        `${member.name} expands more than ${MAX_COMPRESSION_RATIO}× and will not be read.`,
        "zip_compression_ratio"
      );
    }
  };

  if (member.method === METHOD_STORE) {
    for (let offset = start; offset < end; offset += READ_CHUNK_BYTES) {
      const chunk = await source.read(
        offset,
        Math.min(offset + READ_CHUNK_BYTES, end)
      );
      accountFor(chunk);
      yield chunk;
    }
    return;
  }

  // fflate's Inflate is push-based with a callback, so output is buffered
  // between pushes and drained after each one. The queue holds at most the
  // output of a single 4 MB compressed read.
  const pending: Uint8Array[] = [];
  let inflateError: Error | null = null;

  const inflate = new Inflate((chunk) => {
    try {
      accountFor(chunk);
      pending.push(chunk);
    } catch (error) {
      inflateError = error as Error;
    }
  });

  for (let offset = start; offset < end; offset += READ_CHUNK_BYTES) {
    const sliceEnd = Math.min(offset + READ_CHUNK_BYTES, end);
    const compressed = await source.read(offset, sliceEnd);
    inflate.push(compressed, sliceEnd >= end);

    if (inflateError) throw inflateError;
    while (pending.length > 0) yield* rechunk(pending.shift()!);
  }

  if (inflateError) throw inflateError;
  while (pending.length > 0) yield* rechunk(pending.shift()!);
}
