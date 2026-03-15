import path from "path";
import { promises as fs } from "fs";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 1000 * 60 * 30;

async function loadCached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
) {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await loader();
  cache.set(key, {
    expiresAt: now + ttlMs,
    value,
  });
  return value;
}

export async function readPublicTextCached(
  relativePath: string,
  ttlMs?: number,
) {
  const filePath = path.join(process.cwd(), "public", relativePath);
  return loadCached(
    `text:${filePath}`,
    async () => fs.readFile(filePath, "utf8"),
    ttlMs,
  );
}

export async function readPublicJsonCached<T>(
  relativePath: string,
  ttlMs?: number,
) {
  return loadCached(
    `json:${relativePath}`,
    async () => JSON.parse(await readPublicTextCached(relativePath, ttlMs)) as T,
    ttlMs,
  );
}
