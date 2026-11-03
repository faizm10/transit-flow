/** Display helpers shared by the journey test and network impact modals. */

import { secondsToDisplayTime } from "@/lib/gtfs";

export function fmtTime(sec: number): string {
  const day = Math.floor(sec / 86400);
  const base = secondsToDisplayTime(((sec % 86400) + 86400) % 86400);
  return day > 0 ? `${base} (+${day}d)` : base;
}

export function fmtDuration(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

export function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}
