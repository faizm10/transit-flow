/**
 * Browser preflight.
 *
 * The worker is the authority on whether a feed is valid, but it only speaks
 * after the upload finishes — potentially gigabytes and several minutes later.
 * So the browser applies the same rules first, reading only the tail of the
 * file, and refuses archives that would certainly have failed.
 *
 * Cost on a 36 MB feed: a few hundred KB read and roughly 2 ms. That is worth
 * paying to avoid a 36 MB upload that ends in "missing stops.txt".
 *
 * Passing preflight is not a guarantee. It cannot decompress the whole archive
 * or check referential integrity, so the worker still has the final say. When
 * preflight cannot read an archive at all (zip64 spanning, unusual layouts) it
 * degrades to a warning and lets the upload proceed.
 */

import { readZipIndex, type ZipEntry } from "./zipIndex";
import { resolveGtfsLayout, type GtfsZipLayout } from "./zipLayout";
import { readZipEntryText } from "./zipRead";
import {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_COMPRESSION_RATIO,
  MAX_UNCOMPRESSED_BYTES,
} from "./spec";
import { formatBytes } from "@/lib/format";

export interface PreflightProblem {
  code: string;
  message: string;
  /** `error` blocks the upload; `warning` is shown and the upload continues. */
  severity: "error" | "warning";
}

export interface PreflightResult {
  ok: boolean;
  problems: PreflightProblem[];
  layout: GtfsZipLayout | null;
  /** Read from agency.txt when the entry is small enough to inflate cheaply. */
  agencyName: string | null;
  entryCount: number;
  totalUncompressedBytes: number;
}

/** Largest entry we will inflate during preflight, to stay fast and bounded. */
const MAX_PREFLIGHT_INFLATE_BYTES = 256 * 1024;

export async function preflightGtfsArchive(
  file: File
): Promise<PreflightResult> {
  const problems: PreflightProblem[] = [];
  const fail = (code: string, message: string) =>
    problems.push({ code, message, severity: "error" });
  const warn = (code: string, message: string) =>
    problems.push({ code, message, severity: "warning" });

  const empty: PreflightResult = {
    ok: false,
    problems,
    layout: null,
    agencyName: null,
    entryCount: 0,
    totalUncompressedBytes: 0,
  };

  // ── Cheap checks first ────────────────────────────────────────────────────
  if (file.size === 0) {
    fail("empty_file", "That file is empty.");
    return empty;
  }
  if (file.size > MAX_ARCHIVE_BYTES) {
    fail(
      "archive_too_large",
      `That archive is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_ARCHIVE_BYTES)}.`
    );
    return empty;
  }
  if (!/\.zip$/i.test(file.name)) {
    fail(
      "not_a_zip",
      "GTFS feeds are distributed as a .zip archive. Select the zip file rather than an extracted folder."
    );
    return empty;
  }

  // ── Read the central directory ────────────────────────────────────────────
  const index = await readZipIndex(file);
  if (!index.ok) {
    // We could not read it, which is not the same as knowing it is bad. Warn
    // and let the worker decide.
    warn(
      "unreadable_index",
      `The archive's index could not be read in the browser (${index.reason}), so it could not be checked before uploading. The upload will continue and the server will validate it.`
    );
    return { ...empty, ok: true, problems };
  }

  const entries = index.entries;

  // ── Archive-shape safety ──────────────────────────────────────────────────
  // These bound the untrusted-archive attacks. The worker enforces them again
  // against real decompressed bytes; here we can only check declared sizes,
  // which a crafted archive can lie about — hence the second check later.
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    fail(
      "too_many_entries",
      `This archive contains ${entries.length.toLocaleString()} entries. A GTFS feed has a few dozen; this looks like the wrong file.`
    );
  }

  const totalUncompressed = entries.reduce(
    (sum, e) => sum + (e.uncompressedSize || 0),
    0
  );
  const totalCompressed = entries.reduce(
    (sum, e) => sum + (e.compressedSize || 0),
    0
  );

  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    fail(
      "expands_too_large",
      `This archive expands to ${formatBytes(totalUncompressed)}, past the ${formatBytes(MAX_UNCOMPRESSED_BYTES)} limit.`
    );
  }
  if (
    totalCompressed > 0 &&
    totalUncompressed / totalCompressed > MAX_COMPRESSION_RATIO
  ) {
    fail(
      "compression_ratio",
      `This archive expands ${Math.round(totalUncompressed / totalCompressed)}× when decompressed, which is far outside the range for text data. It will not be processed.`
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  const layout = resolveGtfsLayout(entries.map((e) => e.name));

  if (layout.unsafePaths.length > 0) {
    fail(
      "unsafe_paths",
      `This archive contains entries with unsafe paths (${layout.unsafePaths.slice(0, 3).join(", ")}). It will not be processed.`
    );
  }

  if (layout.candidates.length > 1) {
    fail(
      "ambiguous_root",
      `This archive contains more than one GTFS feed (${layout.candidates.map((c) => c || "the archive root").join(", ")}). Upload them as separate datasets.`
    );
  } else if (layout.root === null) {
    if (layout.missing.length > 0) {
      fail(
        "missing_files",
        `This archive is missing ${listFiles(layout.missing)}. A GTFS feed must contain all of them.`
      );
    } else {
      fail(
        "no_feed_found",
        "No GTFS feed was found in this archive. The .txt files must sit at the archive root or in a single folder."
      );
    }
  } else if (!layout.hasCalendar) {
    // Not fatal in practice: many feeds ship only calendar_dates.txt, and some
    // ship neither and are still importable — just with no service calendar.
    warn(
      "no_calendar",
      "This feed contains neither calendar.txt nor calendar_dates.txt, so no service dates will be available."
    );
  }

  // ── Agency name, for prefilling the dataset ───────────────────────────────
  let agencyName: string | null = null;
  if (layout.root !== null) {
    agencyName = await readAgencyName(file, entries, layout.root);
  }

  return {
    ok: !problems.some((p) => p.severity === "error"),
    problems,
    layout,
    agencyName,
    entryCount: entries.length,
    totalUncompressedBytes: totalUncompressed,
  };
}

function listFiles(files: string[]): string {
  if (files.length === 1) return files[0];
  return `${files.slice(0, -1).join(", ")} and ${files[files.length - 1]}`;
}

/**
 * Inflate agency.txt and read the first `agency_name`.
 *
 * Only entries under the inflate cap are read, so a crafted archive declaring a
 * tiny agency.txt cannot make preflight decompress something enormous.
 */
async function readAgencyName(
  file: File,
  entries: ZipEntry[],
  root: string
): Promise<string | null> {
  const entry = entries.find((e) => e.name === `${root}agency.txt`);
  if (!entry || entry.uncompressedSize > MAX_PREFLIGHT_INFLATE_BYTES) {
    return null;
  }

  try {
    const text = await readZipEntryText(file, entry, MAX_PREFLIGHT_INFLATE_BYTES);
    if (!text) return null;
    const [headerLine, firstRow] = text.split(/\r?\n/, 2);
    if (!headerLine || !firstRow) return null;

    const header = headerLine
      .replace(/^﻿/, "")
      .split(",")
      .map((h: string) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
    const nameIndex = header.indexOf("agency_name");
    if (nameIndex === -1) return null;

    const value = splitCsvLine(firstRow)[nameIndex]?.trim();
    return value ? value.slice(0, 120) : null;
  } catch {
    // Preflight is best-effort; a name we could not read is not a problem.
    return null;
  }
}

/** Minimal quote-aware CSV split — one line, no embedded newlines. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}
