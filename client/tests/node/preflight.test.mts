/**
 * Preflight primitives, tested outside a browser.
 *
 * `Blob` and `File` exist in Node 20+, so zipIndex / zipLayout / sha256 run
 * unmodified — the same code the browser runs, not a reimplementation.
 *
 * Fixtures are built in memory with fflate so this runs in CI with no large
 * files checked in. When a real GTFS feed is present at
 * `server/data/gotransit/`, it is additionally exercised, because a synthetic
 * zip does not prove much about a 36 MB archive with a 174 MB member.
 *
 * Run: npm run test:node
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";

import { readZipIndex } from "../../lib/gtfs/zipIndex";
import { resolveGtfsLayout } from "../../lib/gtfs/zipLayout";
import { hashBlob } from "../../lib/gtfs/hashBlob";
import { parseGtfsTime, formatGtfsTime } from "../../lib/gtfs/spec";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = ""): void {
  checks++;
  if (!ok) failures++;
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`
  );
}

const REQUIRED = [
  "agency.txt",
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
];

const utf8 = (s: string) => new TextEncoder().encode(s);

function buildZip(files: Record<string, string>): Blob {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = utf8(content);
  }
  return new Blob([zipSync(entries) as unknown as BlobPart]);
}

function minimalFeed(prefix = ""): Record<string, string> {
  return {
    [`${prefix}agency.txt`]:
      "agency_id,agency_name,agency_url,agency_timezone\n1,Test Transit,https://example.com,America/Toronto\n",
    [`${prefix}stops.txt`]:
      "stop_id,stop_name,stop_lat,stop_lon\nS1,First Stop,43.6,-79.4\n",
    [`${prefix}routes.txt`]:
      "route_id,route_short_name,route_long_name,route_type\nR1,1,Main Line,3\n",
    [`${prefix}trips.txt`]: "route_id,service_id,trip_id\nR1,WD,T1\n",
    [`${prefix}stop_times.txt`]:
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,S1,1\n",
    [`${prefix}calendar.txt`]:
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWD,1,1,1,1,1,0,0,20260101,20261231\n",
  };
}

async function main(): Promise<void> {
  // ── Synthetic archives ────────────────────────────────────────────────────
  console.log("\nzip index + layout");

  {
    const index = await readZipIndex(buildZip(minimalFeed()));
    check("flat feed: index read", index.ok);
    if (index.ok) {
      const layout = resolveGtfsLayout(index.entries.map((e) => e.name));
      check("flat feed: root is archive root", layout.root === "", `root=${JSON.stringify(layout.root)}`);
      check("flat feed: nothing missing", layout.missing.length === 0, layout.missing.join(","));
      check("flat feed: calendar detected", layout.hasCalendar);
    }
  }

  {
    const index = await readZipIndex(buildZip(minimalFeed("google_transit/")));
    check("nested feed: index read", index.ok);
    if (index.ok) {
      const layout = resolveGtfsLayout(index.entries.map((e) => e.name));
      check(
        "nested feed: root is google_transit/",
        layout.root === "google_transit/",
        `root=${JSON.stringify(layout.root)}`
      );
    }
  }

  {
    // A zip too small to contain an end-of-central-directory record.
    const index = await readZipIndex(new Blob([utf8("not a zip")]));
    check("garbage input rejected, not thrown", !index.ok, index.ok ? "" : index.reason);
  }

  // ── Layout rules (pure) ───────────────────────────────────────────────────
  console.log("\nlayout rules");

  {
    const two = resolveGtfsLayout([
      ...REQUIRED.map((f) => `a/${f}`),
      ...REQUIRED.map((f) => `b/${f}`),
    ]);
    check(
      "two complete folders are ambiguous",
      two.candidates.length === 2 && two.root === null,
      `candidates=${JSON.stringify(two.candidates)}`
    );
  }
  {
    const l = resolveGtfsLayout(["agency.txt", "stops.txt", "routes.txt"]);
    check(
      "missing files are named",
      l.root === null && l.missing.includes("trips.txt") && l.missing.includes("stop_times.txt"),
      `missing=${l.missing.join(",")}`
    );
  }
  {
    const l = resolveGtfsLayout([...REQUIRED, "../../etc/passwd", "/abs/path.txt"]);
    check("path traversal and absolute paths detected", l.unsafePaths.length === 2, JSON.stringify(l.unsafePaths));
  }
  {
    // The worker checks extracted files on a case-sensitive filesystem, so the
    // browser must agree that `Stops.txt` is a missing `stops.txt`.
    const l = resolveGtfsLayout(["agency.txt", "Stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]);
    check("filename matching is case-sensitive", l.missing.includes("stops.txt"));
  }
  {
    const l = resolveGtfsLayout([...REQUIRED, "__MACOSX/._stops.txt", ".DS_Store", "sub/"]);
    check("macOS cruft ignored", l.root === "", `root=${JSON.stringify(l.root)}`);
  }
  {
    const l = resolveGtfsLayout(REQUIRED);
    check("absent calendar reported without failing the layout", l.root === "" && !l.hasCalendar);
  }

  // ── SHA-256 ───────────────────────────────────────────────────────────────
  console.log("\nchunked SHA-256");

  {
    // Block-boundary sizes are where a hand-rolled SHA-256 goes wrong: 55/56
    // straddle the length-padding boundary, 64 is exactly one block, and
    // 8 MB + 1 crosses the chunk size the reader feeds it.
    const sizes = [0, 1, 55, 56, 57, 63, 64, 65, 127, 128, 1000, 8 * 1024 * 1024 + 1];
    let allMatch = true;
    for (const size of sizes) {
      const buf = Buffer.alloc(size, 0xab);
      const want = createHash("sha256").update(buf).digest("hex");
      const got = await hashBlob(new Blob([buf]));
      if (got !== want) {
        allMatch = false;
        check(`SHA-256 size=${size}`, false, `got ${got.slice(0, 16)}… want ${want.slice(0, 16)}…`);
      }
    }
    check(`SHA-256 matches node:crypto at ${sizes.length} boundary sizes`, allMatch);
  }

  {
    let lastLoaded = -1;
    let monotonic = true;
    let sawTotal = true;
    const buf = Buffer.alloc(20 * 1024 * 1024, 7);
    await hashBlob(new Blob([buf]), {
      onProgress: ({ loaded, total }) => {
        if (loaded < lastLoaded) monotonic = false;
        if (total !== buf.length) sawTotal = false;
        lastLoaded = loaded;
      },
    });
    check("progress is monotonic and reports the real total", monotonic && sawTotal && lastLoaded === buf.length);
  }

  // ── GTFS time parsing ─────────────────────────────────────────────────────
  console.log("\nGTFS time");

  check("08:30:00 parses", parseGtfsTime("08:30:00") === 8 * 3600 + 30 * 60);
  check(
    "post-midnight 25:10:00 parses past 24h",
    parseGtfsTime("25:10:00") === 25 * 3600 + 10 * 60,
    "this is why stop times are an integer, not a time column"
  );
  check("HH:MM without seconds parses", parseGtfsTime("6:05") === 6 * 3600 + 5 * 60);
  check("blank is null, not zero", parseGtfsTime("") === null && parseGtfsTime("   ") === null);
  check("malformed is null", parseGtfsTime("nope") === null && parseGtfsTime("08:99:00") === null);
  check("round-trips past 24h", formatGtfsTime(parseGtfsTime("25:10:07")!) === "25:10:07");

  // ── Real feed, when present ───────────────────────────────────────────────
  const realFeedDir = join(process.cwd(), "..", "server", "data", "gotransit");
  if (existsSync(join(realFeedDir, "stop_times.txt"))) {
    console.log("\nreal GTFS feed (server/data/gotransit)");

    const files: Record<string, string> = {};
    for (const name of readdirSync(realFeedDir)) {
      if (name.endsWith(".txt")) {
        files[name] = readFileSync(join(realFeedDir, name), "utf-8");
      }
    }
    const blob = buildZip(files);

    const started = performance.now();
    const index = await readZipIndex(blob);
    const indexMs = performance.now() - started;

    check(
      "real feed: index read from the tail alone",
      index.ok,
      index.ok ? `${index.entries.length} entries in ${indexMs.toFixed(1)}ms` : index.reason
    );

    if (index.ok) {
      const layout = resolveGtfsLayout(index.entries.map((e) => e.name));
      check("real feed: layout resolves to root", layout.root === "");
      check("real feed: nothing missing", layout.missing.length === 0, layout.missing.join(","));

      const stopTimes = index.entries.find((e) => e.name === "stop_times.txt");
      check(
        "real feed: large member sized without decompressing",
        (stopTimes?.uncompressedSize ?? 0) > 100_000_000,
        `stop_times.txt = ${((stopTimes?.uncompressedSize ?? 0) / 1e6).toFixed(0)} MB uncompressed`
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const want = createHash("sha256").update(bytes).digest("hex");
    const t0 = performance.now();
    const got = await hashBlob(blob);
    check(
      "real feed: chunked SHA-256 matches node:crypto",
      got === want,
      `${(bytes.length / 1e6).toFixed(1)} MB in ${(performance.now() - t0).toFixed(0)}ms`
    );
  } else {
    console.log("\n(skipping real-feed checks — server/data/gotransit not present)");
  }

  console.log(
    failures === 0
      ? `\n${checks} checks passed`
      : `\n${failures} of ${checks} checks FAILED`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
