/**
 * Where the GTFS files sit inside a zip, decided from entry names alone.
 *
 * Mirrors the worker's `findGtfsRoot` (worker/src/validate.ts): the feed is
 * either at the archive root or in exactly one immediate subdirectory, and
 * two candidate directories are a hard error there. Keeping the rule in one
 * pure function means the browser's verdict matches what the worker will do.
 *
 * Dependency-free — the worker package's tests import it directly.
 */

import { REQUIRED_GTFS_FILES, OPTIONAL_GTFS_FILES, hasServiceCalendar } from "./spec";


export interface GtfsZipLayout {
  /** "" for the archive root, "google_transit/" for a nested feed, null if undecidable. */
  root: string | null;
  /** Required files missing at `root` (or at the closest candidate). */
  missing: string[];
  /** Optional files present at `root`. */
  optional: string[];
  /** Directories that hold a complete feed. More than one and the worker refuses. */
  candidates: string[];
  /** Entries the extractor rejects outright (absolute or `..` paths). */
  unsafePaths: string[];
  /** GTFS requires calendar.txt or calendar_dates.txt; neither is fatal. */
  hasCalendar: boolean;
}

const IGNORED_PREFIXES = ["__MACOSX/", ".git/"];

function isIgnored(name: string): boolean {
  if (name.endsWith("/")) return true;
  if (IGNORED_PREFIXES.some((p) => name.startsWith(p))) return true;
  const base = name.slice(name.lastIndexOf("/") + 1);
  return base === "" || base === ".DS_Store" || base.startsWith("._");
}

export function isUnsafeZipPath(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return true;
  return normalized.split("/").some((part) => part === "..");
}

export function resolveGtfsLayout(names: string[]): GtfsZipLayout {
  const unsafePaths = names.filter(isUnsafeZipPath);

  // dir prefix ("" or "sub/") → file names directly inside it
  const byDir = new Map<string, Set<string>>();
  for (const raw of names) {
    if (isUnsafeZipPath(raw)) continue;
    const name = raw.replace(/\\/g, "/");
    if (isIgnored(name)) continue;
    const slash = name.lastIndexOf("/");
    const dir = slash === -1 ? "" : name.slice(0, slash + 1);
    // Only the root and its immediate children can be a feed root.
    if (dir.split("/").length > 2) continue;
    let set = byDir.get(dir);
    if (!set) {
      set = new Set<string>();
      byDir.set(dir, set);
    }
    // Case-sensitive on purpose: the worker checks the extracted files with
    // existsSync on Linux, so `Stops.txt` is genuinely a missing `stops.txt`.
    set.add(name.slice(slash + 1));
  }

  const missingIn = (dir: string): string[] => {
    const files = byDir.get(dir) ?? new Set<string>();
    return REQUIRED_GTFS_FILES.filter((f) => !files.has(f));
  };

  const candidates = [...byDir.keys()]
    .filter((dir) => missingIn(dir).length === 0)
    .sort();

  // Root wins if complete; otherwise a single complete subdirectory; otherwise
  // report against whichever directory is closest to complete.
  let root: string | null = null;
  if (candidates.includes("")) root = "";
  else if (candidates.length === 1) root = candidates[0];

  const best =
    root ??
    [...byDir.keys()].sort(
      (a, b) => missingIn(a).length - missingIn(b).length || a.length - b.length
    )[0] ??
    "";

  const filesAtBest = byDir.get(best) ?? new Set<string>();
  return {
    root,
    hasCalendar: hasServiceCalendar(filesAtBest),
    missing: missingIn(best),
    optional: OPTIONAL_GTFS_FILES.filter((f) => filesAtBest.has(f)),
    candidates,
    unsafePaths,
  };
}
