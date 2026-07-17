"use client";

/**
 * City GTFS overlays — client orchestration.
 *
 * parseZip() runs the heavy GTFS parse in a web worker; saveFeed() registers
 * the feed then uploads the gzipped payload in ≤2MB chunks (Vercel body cap);
 * toggling a saved feed on lazily fetches + decompresses its payload once and
 * caches it for the session. Signed-out users can still preview a parsed feed
 * locally via addLocalFeed() — it just isn't persisted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  buildCityFeedGeoJSON,
  decompressPayload,
  UPLOAD_CHUNK_BYTES,
  type CityFeedMeta,
  type CityFeedPayload,
  type CityFeedStats,
  type ParserMessage,
} from "@/lib/cityGtfs";

export interface ParsedFeed {
  agency: string | null;
  stats: CityFeedStats;
  gzipped: Uint8Array;
}

export interface ParseProgressState {
  phase: string;
  pct: number;
}

export interface CityFeedEntry extends CityFeedMeta {
  /** false → parsed this session but not persisted (signed out) */
  saved: boolean;
}

export function useCityFeeds() {
  const { status } = useSession();
  const [savedFeeds, setSavedFeeds] = useState<CityFeedMeta[]>([]);
  const [localFeeds, setLocalFeeds] = useState<CityFeedMeta[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [parseProgress, setParseProgress] = useState<ParseProgressState | null>(null);
  // Decompressed payloads, cached per feed for the session. Bumping the
  // version signals memos that the ref's contents changed.
  const payloadCache = useRef(new Map<string, CityFeedPayload>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  // ── List saved feeds once signed in ────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/city-feeds")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSavedFeeds(d.feeds ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  // ── Parse a GTFS zip in the worker ─────────────────────────────────────────
  const parseZip = useCallback((file: File): Promise<ParsedFeed> => {
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("../lib/workers/gtfsParser.worker.ts", import.meta.url)
    );
    workerRef.current = worker;
    setParseProgress({ phase: "Reading zip", pct: 0 });

    return new Promise<ParsedFeed>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<ParserMessage>) => {
        const msg = e.data;
        if (msg.type === "progress") {
          setParseProgress({ phase: msg.phase, pct: msg.pct });
        } else if (msg.type === "result") {
          setParseProgress(null);
          worker.terminate();
          workerRef.current = null;
          resolve({
            agency: msg.agency,
            stats: msg.stats,
            gzipped: new Uint8Array(msg.gzipped),
          });
        } else {
          setParseProgress(null);
          worker.terminate();
          workerRef.current = null;
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        setParseProgress(null);
        worker.terminate();
        workerRef.current = null;
        reject(new Error(e.message || "GTFS parser failed"));
      };
      worker.postMessage({ file });
    });
  }, []);

  const cancelParse = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setParseProgress(null);
  }, []);

  const cachePayload = useCallback((id: string, gzipped: Uint8Array) => {
    payloadCache.current.set(id, decompressPayload(gzipped));
    setCacheVersion((v) => v + 1);
  }, []);

  // ── Save to the user's account (register + chunked upload) ────────────────
  const saveFeed = useCallback(
    async (name: string, color: string, parsed: ParsedFeed): Promise<CityFeedMeta> => {
      const chunkCount = Math.ceil(parsed.gzipped.byteLength / UPLOAD_CHUNK_BYTES);

      const createRes = await fetch("/api/city-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          agency: parsed.agency,
          color,
          stats: parsed.stats,
          byteSize: parsed.gzipped.byteLength,
          chunkCount,
        }),
      });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not save feed");
      }
      const { id } = (await createRes.json()) as { id: string };

      for (let i = 0; i < chunkCount; i++) {
        const slice = parsed.gzipped.slice(
          i * UPLOAD_CHUNK_BYTES,
          (i + 1) * UPLOAD_CHUNK_BYTES
        );
        const res = await fetch(`/api/city-feeds/${id}/chunks?idx=${i}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: slice,
        });
        if (!res.ok) {
          // Leave no half-uploaded feed behind
          await fetch(`/api/city-feeds/${id}`, { method: "DELETE" }).catch(() => {});
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `Upload failed at part ${i + 1}/${chunkCount}`);
        }
      }

      const meta: CityFeedMeta = {
        id,
        name,
        agency: parsed.agency,
        color,
        stats: parsed.stats,
        byteSize: parsed.gzipped.byteLength,
        createdAt: new Date().toISOString(),
      };
      setSavedFeeds((prev) => [meta, ...prev]);
      // Already have the payload locally — cache and show immediately.
      cachePayload(id, parsed.gzipped);
      setVisibleIds((prev) => new Set(prev).add(id));
      return meta;
    },
    [cachePayload]
  );

  // ── Session-only feed (signed out preview) ─────────────────────────────────
  const addLocalFeed = useCallback(
    (name: string, color: string, parsed: ParsedFeed): CityFeedMeta => {
      const meta: CityFeedMeta = {
        id: `local-${crypto.randomUUID()}`,
        name,
        agency: parsed.agency,
        color,
        stats: parsed.stats,
        byteSize: parsed.gzipped.byteLength,
        createdAt: new Date().toISOString(),
      };
      setLocalFeeds((prev) => [meta, ...prev]);
      cachePayload(meta.id, parsed.gzipped);
      setVisibleIds((prev) => new Set(prev).add(meta.id));
      return meta;
    },
    [cachePayload]
  );

  const deleteFeed = useCallback(async (id: string) => {
    if (!id.startsWith("local-")) {
      const res = await fetch(`/api/city-feeds/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not delete feed");
      }
    }
    setSavedFeeds((prev) => prev.filter((f) => f.id !== id));
    setLocalFeeds((prev) => prev.filter((f) => f.id !== id));
    setVisibleIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    payloadCache.current.delete(id);
    setCacheVersion((v) => v + 1);
  }, []);

  // ── Visibility (lazily fetch payload on first show) ────────────────────────
  const toggleFeed = useCallback(
    async (id: string, visible: boolean) => {
      setVisibleIds((prev) => {
        const next = new Set(prev);
        if (visible) next.add(id);
        else next.delete(id);
        return next;
      });
      if (!visible || payloadCache.current.has(id) || id.startsWith("local-")) return;

      setLoadingIds((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/city-feeds/${id}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Could not load feed");
        }
        cachePayload(id, new Uint8Array(await res.arrayBuffer()));
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [cachePayload]
  );

  const feeds: CityFeedEntry[] = useMemo(
    () => [
      ...localFeeds.map((f) => ({ ...f, saved: false })),
      ...savedFeeds.map((f) => ({ ...f, saved: true })),
    ],
    [localFeeds, savedFeeds]
  );

  // ── GeoJSON for the map (visible feeds whose payloads are loaded) ─────────
  const overlay = useMemo(() => {
    const loaded: { meta: CityFeedMeta; payload: CityFeedPayload }[] = [];
    for (const meta of feeds) {
      if (!visibleIds.has(meta.id)) continue;
      const payload = payloadCache.current.get(meta.id);
      if (payload) loaded.push({ meta, payload });
    }
    return buildCityFeedGeoJSON(loaded);
    // cacheVersion tracks payloadCache ref contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds, visibleIds, cacheVersion]);

  return {
    feeds,
    visibleIds,
    loadingIds,
    parseProgress,
    overlay,
    isAuthenticated: status === "authenticated",
    parseZip,
    cancelParse,
    saveFeed,
    addLocalFeed,
    deleteFeed,
    toggleFeed,
  };
}
