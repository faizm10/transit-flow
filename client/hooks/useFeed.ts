"use client";
import { useState, useEffect, useCallback } from "react";
import { myFeedsUrl } from "@/lib/localFeeds";

export type FeedMode = "go" | "city" | "both";

export interface FeedMeta {
  id: string;
  cityName: string;
  status: string;
  routeCount: number | null;
  stopCount: number | null;
  errorMessage: string | null;
  createdAt: string;
}

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key]);

  return [value, set];
}

export function useFeed() {
  const [activeFeedId, setActiveFeedId] = useLocalStorage<string | null>("tf_active_feed_id", null);
  const [feedMode, setFeedMode]         = useLocalStorage<FeedMode>("tf_feed_mode", "go");
  const [feeds, setFeeds]               = useState<FeedMeta[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedsLoaded, setFeedsLoaded]   = useState(false);

  const refreshFeeds = useCallback(async () => {
    setFeedsLoading(true);
    try {
      const res = await fetch(myFeedsUrl());
      if (res.ok) {
        const data = await res.json() as { feeds: FeedMeta[] };
        setFeeds(data.feeds);
        setFeedsLoaded(true);
      }
    } catch { /* ignore */ } finally {
      setFeedsLoading(false);
    }
  }, []);

  useEffect(() => { refreshFeeds(); }, [refreshFeeds]);

  const readyFeeds = feeds.filter(f => f.status === "ready");

  // Resolve the city GeoJSON URL for the active feed
  function getCityGeoJsonUrl(): string | undefined {
    if (!activeFeedId) return undefined;
    // The blobBaseUrl is stored in the DB; we derive the GeoJSON URL via the API
    return `/api/gtfs/feeds/${activeFeedId}/geojson-url`;
  }

  // When feed mode is "go" or activeFeedId is cleared, reset to GO-only
  const effectiveFeedMode: FeedMode =
    feedMode !== "go" && !activeFeedId ? "go" : feedMode;

  return {
    activeFeedId,
    setActiveFeedId,
    feedMode: effectiveFeedMode,
    setFeedMode,
    feeds,
    readyFeeds,
    feedsLoading,
    feedsLoaded,
    refreshFeeds,
    getCityGeoJsonUrl,
  };
}
