"use client";

import { useEffect, useState } from "react";
import type { ServiceUpdatesResult } from "@/lib/serviceUpdates";

/** Re-check while the tab stays open. Alerts move on the order of minutes. */
const REFRESH_MS = 5 * 60 * 1000;

interface UseServiceAlerts {
  data: ServiceUpdatesResult | null;
  /** True once the first response (success or failure) has landed. */
  loaded: boolean;
}

/**
 * Shared client-side reader for the GO service-updates feed. One fetch, one
 * timer, shared by the map's status pill and the on-map alert overlay so the
 * page doesn't hit /api/service-updates twice.
 */
export function useServiceAlerts(): UseServiceAlerts {
  const [data, setData] = useState<ServiceUpdatesResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/service-updates");
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as ServiceUpdatesResult;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { data, loaded };
}
