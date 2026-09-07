import type { Sql } from "postgres";

import { config } from "./config.ts";

/**
 * Bulk loading with `COPY ... FROM STDIN`.
 *
 * The alternative — `INSERT` batches — is 10–50× slower at this scale. A GO
 * feed's `stop_times.txt` is roughly 5 million rows; at INSERT speeds that is
 * tens of minutes of database time per import, and it holds a connection open
 * the whole while.
 *
 * Text format rather than binary: binary COPY is marginally faster but requires
 * getting every type's wire encoding exactly right, and a mistake there is a
 * corrupt row rather than a loud error. Text format's escaping rules are four
 * characters long and easy to verify.
 *
 * Rows are streamed to the socket in batches with backpressure respected, so
 * the buffered batch — not the file — is the memory ceiling.
 */

/** Postgres text-format COPY: these five characters must be escaped. */
function encodeField(value: string | number | boolean | null): string {
  if (value === null) return "\\N";
  if (typeof value === "number") {
    // NaN/Infinity have no text-format representation for numeric columns.
    return Number.isFinite(value) ? String(value) : "\\N";
  }
  if (typeof value === "boolean") return value ? "t" : "f";

  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

export type CopyValue = string | number | boolean | null;

/**
 * A COPY session for one table.
 *
 * Usage:
 *   const copy = await beginCopy(sql, "gtfs_stops", ["dataset_id", "stop_id"]);
 *   for (...) await copy.write([datasetId, stopId]);
 *   const rows = await copy.end();
 */
export interface CopyWriter {
  write(row: CopyValue[]): Promise<void>;
  /** Flush, close the stream, and return the number of rows written. */
  end(): Promise<number>;
  /** Abort without committing the rows written so far. */
  destroy(error?: Error): void;
  readonly rowCount: number;
}

export async function beginCopy(
  sql: Sql,
  table: string,
  columns: string[]
): Promise<CopyWriter> {
  // `table` and `columns` are never user input — they are literals from the
  // importer modules — so interpolating them is safe. Guard anyway, because a
  // future caller passing a feed-derived name here would be a SQL injection.
  assertIdentifier(table);
  columns.forEach(assertIdentifier);

  const statement = `COPY ${table} (${columns.join(", ")}) FROM STDIN WITH (FORMAT text)`;
  const stream = await sql.unsafe(statement).writable();

  let rowCount = 0;
  let buffer: string[] = [];
  let bufferedChars = 0;

  /** Flush when the buffer reaches roughly this many characters (~4 MB). */
  const FLUSH_CHARS = 4 * 1024 * 1024;

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const payload = buffer.join("");
    buffer = [];
    bufferedChars = 0;

    // Respect backpressure: if the socket buffer is full, wait for drain
    // rather than queueing unbounded data in memory.
    if (!stream.write(payload)) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          stream.off("error", onError);
          resolve();
        };
        const onError = (error: Error) => {
          stream.off("drain", onDrain);
          reject(error);
        };
        stream.once("drain", onDrain);
        stream.once("error", onError);
      });
    }
  };

  return {
    get rowCount() {
      return rowCount;
    },

    async write(row: CopyValue[]): Promise<void> {
      const line = `${row.map(encodeField).join("\t")}\n`;
      buffer.push(line);
      bufferedChars += line.length;
      rowCount++;
      if (bufferedChars >= FLUSH_CHARS) await flush();
    },

    async end(): Promise<number> {
      await flush();
      await new Promise<void>((resolve, reject) => {
        stream.once("error", reject);
        stream.end(resolve);
      });
      return rowCount;
    },

    destroy(error?: Error): void {
      stream.destroy(error);
    },
  };
}

/**
 * Run `each` over rows, committing every `copyBatchRows` in its own COPY.
 *
 * Batching bounds two things at once: how much a failure costs to redo, and
 * how long a single statement holds the connection. Batches are independent —
 * a partially imported table is cleaned up by the caller deleting the
 * dataset's rows, which is cheap and indexed.
 */
export async function copyInBatches<T>(
  sql: Sql,
  table: string,
  columns: string[],
  rows: AsyncIterable<T>,
  toRow: (item: T) => CopyValue[] | null,
  options: { onProgress?: (rowsWritten: number) => void } = {}
): Promise<number> {
  const batchSize = config.copyBatchRows;
  let total = 0;
  let writer: CopyWriter | null = null;
  let inBatch = 0;

  try {
    for await (const item of rows) {
      // `null` means "skip this row" — an invalid row the importer has already
      // recorded as a validation issue.
      const values = toRow(item);
      if (values === null) continue;

      writer ??= await beginCopy(sql, table, columns);
      await writer.write(values);
      inBatch++;

      if (inBatch >= batchSize) {
        total += await writer.end();
        writer = null;
        inBatch = 0;
        options.onProgress?.(total);
      }
    }

    if (writer) {
      total += await writer.end();
      writer = null;
      options.onProgress?.(total);
    }
  } catch (error) {
    writer?.destroy(error as Error);
    throw error;
  }

  return total;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Refusing to use ${JSON.stringify(name)} as a SQL identifier`);
  }
}
