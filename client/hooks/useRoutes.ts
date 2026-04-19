"use client";

import { useState, useCallback, useEffect } from "react";
import { CustomRoute, CustomStop, CustomSchedule } from "@/lib/gtfs";
import { getCustomRouteColor } from "@/lib/routeColors";
import { v4 as uuidv4 } from "uuid";

const STORAGE_KEY = "transitflow_custom_routes";

function loadFromStorage(): CustomRoute[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomRoute[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(routes: CustomRoute[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
}

export function useRoutes() {
  const [routes, setRoutes] = useState<CustomRoute[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setRoutes(loadFromStorage());
  }, []);

  const saveRoute = useCallback(
    (route: CustomRoute) => {
      setRoutes((prev) => {
        const existing = prev.findIndex((r) => r.id === route.id);
        const next =
          existing >= 0
            ? prev.map((r, i) => (i === existing ? route : r))
            : [...prev, route];
        saveToStorage(next);
        return next;
      });
    },
    []
  );

  const deleteRoute = useCallback((id: string) => {
    setRoutes((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const createBlankRoute = useCallback((type: "bus" | "train"): CustomRoute => {
    return {
      id: uuidv4(),
      name: "",
      color: getCustomRouteColor(Math.floor(Math.random() * 8)),
      type,
      stops: [],
      createdAt: new Date().toISOString(),
    };
  }, []);

  return { routes, saveRoute, deleteRoute, createBlankRoute };
}
