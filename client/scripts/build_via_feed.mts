/**
 * Build the built-in VIA Rail feed from server/data/viarail/.
 *
 * Runs the same parser that handles uploaded GTFS zips, so VIA's payload has
 * the shape the Feeds tab already draws. Writes:
 *  - public/viarail/derived/feed.json  the payload, fetched when someone ticks VIA
 *  - lib/builtinFeeds.json             the row shown in the list before that
 *
 * Run from client/ after replacing the GTFS files:
 *   npm run build:via-feed
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zipSync } from "fflate";
import { decompressPayload, type ParserMessage } from "../lib/cityGtfs";

const GTFS_DIR = resolve("../server/data/viarail");
const PAYLOAD_DIR = resolve("public/viarail/derived");
const PAYLOAD_URL = "/viarail/derived/feed.json";
const META_PATH = resolve("lib/builtinFeeds.json");
const VIA_YELLOW = "#ffcb06";

function zipGtfsDir(): File {
  const entries: Record<string, Uint8Array> = {};
  for (const name of readdirSync(GTFS_DIR)) {
    if (name.endsWith(".txt")) entries[name] = readFileSync(join(GTFS_DIR, name));
  }
  return new File([zipSync(entries) as BlobPart], "viarail.zip");
}

/** The parser is a web worker: stand in for its global scope and await the result. */
async function parseFeed(file: File) {
  const scope: { postMessage(m: ParserMessage): void; onmessage: unknown } = {
    postMessage: () => {},
    onmessage: null,
  };
  (globalThis as unknown as { self: typeof scope }).self = scope;

  const result = new Promise<Extract<ParserMessage, { type: "result" }>>((done, fail) => {
    scope.postMessage = (msg) => {
      if (msg.type === "result") done(msg);
      if (msg.type === "error") fail(new Error(msg.message));
    };
  });

  await import("../lib/workers/gtfsParser.worker");
  (scope.onmessage as (e: { data: { file: File } }) => void)({ data: { file } });
  return result;
}

function feedStartIso(): string {
  const [header, row] = readFileSync(join(GTFS_DIR, "feed_info.txt"), "utf8").trim().split(/\r?\n/);
  const date = row.split(",")[header.split(",").indexOf("feed_start_date")];
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`;
}

const { agency, stats, gzipped } = await parseFeed(zipGtfsDir());
const json = JSON.stringify(decompressPayload(new Uint8Array(gzipped)));

mkdirSync(PAYLOAD_DIR, { recursive: true });
writeFileSync(join(PAYLOAD_DIR, "feed.json"), json);
writeFileSync(
  META_PATH,
  `${JSON.stringify(
    [
      {
        id: "builtin-viarail",
        name: "VIA Rail",
        agency,
        color: VIA_YELLOW,
        stats,
        byteSize: Buffer.byteLength(json),
        createdAt: feedStartIso(),
        url: PAYLOAD_URL,
      },
    ],
    null,
    2
  )}\n`
);

console.log(
  `VIA Rail: ${stats.routes} routes, ${stats.stops} stops, ${stats.trips} trips, ` +
    `${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`
);
