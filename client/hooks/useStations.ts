"use client";

import { useState, useCallback, useEffect } from "react";
import { CustomStation } from "@/lib/gtfs";
import { v4 as uuidv4 } from "uuid";

const STORAGE_KEY = "transitflow_custom_stations";

function loadFromStorage(): CustomStation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useStations() {
  const [stations, setStations] = useState<CustomStation[]>(loadFromStorage);

  // Persist whenever stations change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stations));
    } catch {
      // ignore quota errors
    }
  }, [stations]);

  const saveStation = useCallback(
    (station: Omit<CustomStation, "id" | "createdAt"> & { id?: string }) => {
      setStations((prev) => {
        const id = station.id ?? uuidv4();
        const existing = prev.find((s) => s.id === id);
        const full: CustomStation = {
          ...station,
          id,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        if (existing) {
          return prev.map((s) => (s.id === id ? full : s));
        }
        return [...prev, full];
      });
    },
    []
  );

  const deleteStation = useCallback((id: string) => {
    setStations((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { stations, saveStation, deleteStation };
}
