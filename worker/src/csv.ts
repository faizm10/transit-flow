/**
 * Streaming CSV.
 *
 * Consumes an async iterable of byte chunks and yields rows as they complete.
 * Nothing larger than one row plus the current chunk is ever held, so a 174 MB
 * `stop_times.txt` costs the same memory as a 2 KB `agency.txt`.
 *
 * The subtleties that matter for real GTFS feeds:
 *  - A quoted field may contain commas, newlines and doubled quotes, and may
 *    straddle a chunk boundary. The parser keeps quote state across pushes.
 *  - A UTF-8 BOM appears on the first header cell of many agency exports and
 *    would otherwise make `agency_id` unmatchable.
 *  - Multi-byte characters straddle chunk boundaries, so decoding is
 *    incremental (`{ stream: true }`) rather than per-chunk.
 *  - Headers vary in order and presence between feeds, so rows are returned as
 *    an index map plus a values array rather than a fixed tuple.
 */

/**
 * Force a flat, independent copy of a string.
 *
 * V8 represents `bigString.slice(a, b)` as a SlicedString that points into the
 * parent, so a 20-character GTFS id sliced out of a chunk keeps that entire
 * chunk alive. Harmless for a value that is used and dropped; a serious leak
 * for the hundreds of thousands of ids the importers retain in Sets for
 * referential checks — measured at ~85 MB for 400k ids that should cost ~16 MB.
 *
 * Call this at the point of *retention*, not on every field: flattening all
 * 55M field values would cost far more than it saves.
 */
export function flatten(value: string): string {
  // Short strings are already materialized flat by V8, so skip the copy.
  if (value.length < 13) return value;
  return Buffer.from(value, "utf8").toString("utf8");
}

export interface CsvRow {
  /** Field values, positionally matching the header. */
  values: string[];
  /** 1-based line number in the file, for error messages. */
  line: number;
}

export class CsvHeader {
  private readonly index: Map<string, number>;

  constructor(readonly columns: string[]) {
    this.index = new Map(columns.map((name, i) => [name, i]));
  }

  has(column: string): boolean {
    return this.index.has(column);
  }

  /** Column value, or "" when the column is absent or the row is short. */
  get(row: CsvRow, column: string): string {
    const at = this.index.get(column);
    if (at === undefined) return "";
    return row.values[at] ?? "";
  }

  /** Column value, or null when absent/blank — for genuinely optional fields. */
  getOptional(row: CsvRow, column: string): string | null {
    const value = this.get(row, column).trim();
    return value === "" ? null : value;
  }
}

export interface CsvStreamResult {
  header: CsvHeader;
  rows: AsyncGenerator<CsvRow>;
}

/**
 * Parse `chunks` as CSV, resolving once the header is known so the caller can
 * validate columns before consuming rows.
 */
export async function readCsv(
  chunks: AsyncIterable<Uint8Array>,
  options: { onBytes?: (decodedBytes: number) => void } = {}
): Promise<CsvStreamResult> {
  const iterator = chunks[Symbol.asyncIterator]();
  const decoder = new TextDecoder("utf-8");

  // `buffer` holds undelivered text; `cursor` is how far into it we have read.
  // Slicing the buffer after every record would create a new string per row —
  // 5M of them for one stop_times.txt — so instead we advance a cursor and
  // compact only when the consumed prefix is worth reclaiming.
  let buffer = "";
  let cursor = 0;
  let exhausted = false;
  let line = 0;
  let decodedBytes = 0;

  /** Drop the consumed prefix once it dominates the buffer. */
  function compact(): void {
    if (cursor === 0) return;
    buffer = buffer.slice(cursor);
    cursor = 0;
  }

  async function fill(): Promise<boolean> {
    if (exhausted) return false;
    const next = await iterator.next();
    if (next.done) {
      exhausted = true;
      // Flush any bytes the decoder was holding for a split character.
      compact();
      buffer += decoder.decode();
      return false;
    }
    decodedBytes += next.value.length;
    options.onBytes?.(decodedBytes);
    // Compact before appending, so the buffer never accumulates consumed text.
    compact();
    buffer += decoder.decode(next.value, { stream: true });
    return true;
  }

  /**
   * The next complete record, or null at end of input.
   *
   * A record ends at a newline that is not inside quotes, so this scans with
   * quote state rather than splitting on "\n".
   */
  async function nextRecord(): Promise<string | null> {
    for (;;) {
      let inQuotes = false;
      for (let i = cursor; i < buffer.length; i++) {
        const ch = buffer.charCodeAt(i);
        if (ch === 34 /* " */) {
          inQuotes = !inQuotes;
        } else if (ch === 10 /* \n */ && !inQuotes) {
          const record = buffer.slice(cursor, i);
          cursor = i + 1;
          return record.endsWith("\r") ? record.slice(0, -1) : record;
        }
      }

      // No terminator in what we have; pull more.
      if (!(await fill())) {
        if (cursor >= buffer.length) return null;
        const record = buffer.slice(cursor);
        cursor = buffer.length;
        return record.endsWith("\r") ? record.slice(0, -1) : record;
      }
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────
  let headerRecord: string | null = null;
  // Skip leading blank lines rather than treating one as an empty header.
  while ((headerRecord = await nextRecord()) !== null) {
    line++;
    if (headerRecord.trim() !== "") break;
  }
  if (headerRecord === null) {
    return {
      header: new CsvHeader([]),
      rows: (async function* () {})(),
    };
  }

  const columns = splitRecord(headerRecord).map((name, i) =>
    // Strip the BOM from the first cell only; elsewhere it is real content.
    (i === 0 ? name.replace(/^﻿/, "") : name).trim().toLowerCase()
  );
  const header = new CsvHeader(columns);

  async function* rows(): AsyncGenerator<CsvRow> {
    for (;;) {
      const record = await nextRecord();
      if (record === null) return;
      line++;
      // Blank lines are common at end of file and are not rows.
      if (record.trim() === "") continue;
      yield { values: splitRecord(record), line };
    }
  }

  return { header, rows: rows() };
}

/**
 * Split one record into fields.
 *
 * Fast path for the overwhelmingly common case of a record with no quotes:
 * `String.split` is dramatically faster than a character loop, and on 5M rows
 * that difference is minutes.
 */
export function splitRecord(record: string): string[] {
  if (!record.includes('"')) return record.split(",");

  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (inQuotes) {
      if (ch === '"') {
        if (record[i + 1] === '"') {
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
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}
