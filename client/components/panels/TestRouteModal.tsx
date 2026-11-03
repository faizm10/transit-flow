"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Bus,
  Footprints,
  Info,
  Loader2,
  Map as MapIcon,
  MapPin,
  Train,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJourneyTest } from "@/hooks/useJourneyTest";
import { secondsToDisplayTime, timeToSeconds, type CustomRoute } from "@/lib/gtfs";
import { haversineM } from "@/lib/journey/network";
import type { ComparisonVerdict, JourneyComparison, SweepRow } from "@/lib/journey/planner";
import type { FeedBasis, JourneySweepResult, JourneyTestResult } from "@/lib/journey/protocol";
import type { Journey, JourneyPlace, NoJourneyReason, PlanResult, SearchLimits } from "@/lib/journey/types";

interface TestRouteModalProps {
  /** The route under test. Key the modal by route id so state resets per route. */
  route: CustomRoute | null;
  /** False while the user is looking at the map (picking a place, viewing a journey). */
  open: boolean;
  onClose: () => void;
  /** Hide the modal and wait for one map click. */
  onPickOnMap: (onPick: (lat: number, lon: number) => void) => void;
  /** Hide the modal and draw both journeys on the map. */
  onShowOnMap: (base: Journey | null, withRoute: Journey | null) => void;
}

interface PlaceOption extends JourneyPlace {
  key: string;
  group: "route" | "go" | "map";
}

// ── Formatting ───────────────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  const day = Math.floor(sec / 86400);
  const base = secondsToDisplayTime(((sec % 86400) + 86400) % 86400);
  return day > 0 ? `${base} (+${day}d)` : base;
}

function fmtDuration(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}

function noJourneyText(reason: NoJourneyReason, limits: SearchLimits, departSec: number): string {
  switch (reason) {
    case "same-place":
      return "Origin and destination are the same place.";
    case "no-stops-near-origin":
      return `No stop on this network is within ${fmtDistance(limits.maxAccessWalkM)} of the origin.`;
    case "no-stops-near-destination":
      return `No stop on this network is within ${fmtDistance(limits.maxAccessWalkM)} of the destination.`;
    case "no-departures":
      return `Nothing departs from stops near the origin within ${limits.horizonSec / 3600} h of ${fmtTime(departSec)} on this service day.`;
    case "not-found":
      return `No journey found within the search limits: leaving within ${limits.horizonSec / 3600} h of ${fmtTime(departSec)}, up to ${limits.maxTransfers} transfers, walks up to ${fmtDistance(limits.maxAccessWalkM)} to or from stops and ${fmtDistance(limits.maxTransferWalkM)} between stops.`;
  }
}

const VERDICT: Record<ComparisonVerdict, { tone: "good" | "neutral" | "bad"; text: (c: JourneyComparison, name: string) => string }> = {
  faster: { tone: "good", text: (c, n) => `${n} gets you there ${fmtDuration(c.timeSavedSec ?? 0)} sooner.` },
  "fewer-transfers": {
    tone: "good",
    text: (c, n) => `Same arrival time, but ${n} saves ${c.transfersSaved} transfer${c.transfersSaved === 1 ? "" : "s"}.`,
  },
  "new-connection": { tone: "good", text: (_c, n) => `Only possible with ${n}: the existing network has no journey for this trip.` },
  same: { tone: "neutral", text: (_c, n) => `${n} is used, but the arrival time and number of transfers stay the same.` },
  unused: { tone: "neutral", text: (_c, n) => `${n} doesn't improve this journey; the fastest option stays on the existing network.` },
  "no-journey": { tone: "bad", text: () => "No journey found on either network." },
};

// ── Place picker ─────────────────────────────────────────────────────────────

function PlacePicker({
  label,
  value,
  options,
  onChange,
  onPickOnMap,
}: {
  label: string;
  value: PlaceOption | null;
  options: PlaceOption[];
  onChange: (p: PlaceOption) => void;
  onPickOnMap: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
    return list.slice(0, 8);
  }, [options, query]);

  const choose = (p: PlaceOption) => {
    onChange(p);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
        {label}
      </label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search stops"
        value={open ? query : value?.name ?? ""}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && matches[active]) { e.preventDefault(); choose(matches[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="h-8 pr-8 text-xs"
      />
      <button
        type="button"
        onClick={onPickOnMap}
        aria-label={`Pick ${label.toLowerCase()} on the map`}
        title="Pick on map"
        className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md text-[var(--landing-faint)] transition-colors hover:bg-[var(--landing-wash)] hover:text-[var(--landing-accent)]"
      >
        <MapPin className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && matches.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)] py-1 shadow-lg"
        >
          {matches.map((o, i) => (
            <li
              key={o.key}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); choose(o); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${
                i === active ? "bg-[var(--landing-wash)]" : ""
              }`}
            >
              <span className="truncate text-[var(--landing-ink)]">{o.name}</span>
              <span aria-hidden className="shrink-0 font-[family-name:var(--landing-mono)] text-[9px] uppercase tracking-[0.06em] text-[var(--landing-faint)]">
                {o.group === "route" ? "Your route" : o.group === "map" ? "Map" : "GO"}
              </span>
              {o.group === "route" && <span className="sr-only">(stop on your route)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Journey card ─────────────────────────────────────────────────────────────

function JourneyCard({
  title,
  result,
  highlight,
  departSec,
}: {
  title: string;
  result: PlanResult;
  highlight: boolean;
  departSec: number;
}) {
  return (
    <section
      aria-label={title}
      className={`min-w-0 flex-1 rounded-lg border p-3 ${
        highlight
          ? "border-[var(--landing-accent)] bg-[color-mix(in_oklab,var(--landing-accent)_5%,transparent)]"
          : "border-[var(--landing-border)] bg-[var(--landing-elevated)]"
      }`}
    >
      <h3 className="font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
        {title}
      </h3>
      {result.found ? (
        <JourneyDetails journey={result.journey} />
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-[var(--landing-muted)]">
          {noJourneyText(result.reason, result.limits, departSec)}
        </p>
      )}
    </section>
  );
}

function JourneyDetails({ journey: j }: { journey: Journey }) {
  const est = j.hasEstimates ? "≈ " : "";
  return (
    <>
      <p className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--landing-ink)]">
        {est}{fmtDuration(j.totalSec)}
      </p>
      <p className="text-[11px] text-[var(--landing-muted)]">
        Arrive {est}{fmtTime(j.arriveSec)}
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
        {[
          ["Waiting", fmtDuration(j.waitSec)],
          ["Transfers", String(j.transfers)],
          ["Walking", j.walkSec > 0 ? fmtDuration(j.walkSec) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-[var(--landing-wash)] px-2 py-1">
            <dt className="text-[9px] uppercase tracking-[0.06em] text-[var(--landing-faint)]">{k}</dt>
            <dd className="font-medium text-[var(--landing-ink)]">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="mt-3 space-y-1.5">
        {j.legs.map((leg, i) =>
          leg.kind === "walk" ? (
            <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--landing-muted)]">
              <Footprints className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Walk {fmtDistance(leg.distanceM)} to {leg.toName}{" "}
                <span className="text-[var(--landing-faint)]">(≈ {fmtDuration(leg.arrSec - leg.depSec)})</span>
              </span>
            </li>
          ) : (
            <li key={i} className="flex items-start gap-2 text-[11px]">
              <span
                className="mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 text-[9px] font-bold text-white"
                style={{ backgroundColor: leg.color }}
              >
                {leg.mode === "train" ? <Train className="h-2.5 w-2.5" aria-hidden /> : <Bus className="h-2.5 w-2.5" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-[var(--landing-ink)]">{leg.routeName}</span>
                {leg.estimated && (
                  <span className="ml-1 rounded bg-[color-mix(in_oklab,var(--landing-amber)_18%,transparent)] px-1 py-px font-[family-name:var(--landing-mono)] text-[9px] uppercase tracking-[0.04em] text-[var(--landing-ink)]">
                    Estimated
                  </span>
                )}
                <span className="block text-[var(--landing-muted)]">
                  {leg.estimated ? "≈ " : ""}{fmtTime(leg.depSec)} {leg.fromName}
                  <ArrowRight className="mx-1 inline h-3 w-3 align-[-2px]" aria-label="to" />
                  {leg.estimated ? "≈ " : ""}{fmtTime(leg.arrSec)} {leg.toName}
                </span>
              </span>
            </li>
          ),
        )}
      </ol>
    </>
  );
}

// ── Sweep results ────────────────────────────────────────────────────────────

const CHART_H = 120;

function SweepResults({
  name,
  result,
  onPickDeparture,
}: {
  name: string;
  result: JourneySweepResult;
  onPickDeparture: (departSec: number) => void;
}) {
  const { rows, summary, limits } = result;
  const [hover, setHover] = useState<number | null>(null);
  const savedMin = (r: SweepRow) => Math.max(0, (r.timeSavedSec ?? 0) / 60);
  const maxMin = Math.max(5, ...rows.map(savedMin));
  // "New connection" columns run full height: there is no existing time to subtract.
  const heightOf = (r: SweepRow) =>
    r.verdict === "new-connection" ? CHART_H : Math.round((savedMin(r) / maxMin) * CHART_H);
  const active = hover === null ? null : rows[hover];
  const hasComparable = rows.some((r) => r.timeSavedSec !== null);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Departures helped" value={`${summary.improved + summary.newConnections} of ${summary.departures}`} />
        <StatTile label="Only possible with route" value={String(summary.newConnections)} />
        <StatTile label="Avg. time saved" value={summary.avgSavedSec === null ? "—" : `≈ ${fmtDuration(summary.avgSavedSec)}`} />
        <StatTile label="Best saving" value={summary.maxSavedSec ? `≈ ${fmtDuration(summary.maxSavedSec)}` : "—"} />
      </dl>

      <figure className="rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-3">
        <figcaption className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-[var(--landing-ink)]">Time saved by {name}, per departure</span>
          <span className="text-[10px] text-[var(--landing-faint)]">Click a column to see that journey</span>
        </figcaption>
        <div className="relative mt-3">
          {/* Recessive gridline at the max value */}
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-[var(--landing-border)]" />
          {hasComparable && (
            <span className="pointer-events-none absolute -top-2 right-0 bg-[var(--landing-elevated)] pl-1 text-[9px] text-[var(--landing-faint)]">
              {Math.round(maxMin)} min
            </span>
          )}
          <div className="flex items-end gap-[2px]" style={{ height: CHART_H }} onMouseLeave={() => setHover(null)}>
            {rows.map((r, i) => (
              <button
                key={r.departSec}
                type="button"
                onClick={() => onPickDeparture(r.departSec)}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${fmtTime(r.departSec)}: ${sweepRowText(r)}`}
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                <span
                  className={`block w-full rounded-t-[4px] transition-opacity ${
                    hover !== null && hover !== i ? "opacity-50" : ""
                  }`}
                  style={{
                    height: Math.max(heightOf(r), r.verdict === "no-journey" ? 0 : 2),
                    background:
                      r.verdict === "new-connection"
                        ? "repeating-linear-gradient(45deg, var(--landing-accent) 0 3px, color-mix(in oklab, var(--landing-accent) 35%, transparent) 3px 6px)"
                        : savedMin(r) > 0
                          ? "var(--landing-accent)"
                          : "var(--landing-border-2)",
                  }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between border-t border-[var(--landing-border-2)] pt-1 text-[9px] text-[var(--landing-faint)]">
            <span>{fmtTime(rows[0]?.departSec ?? 0)}</span>
            <span>{fmtTime(rows[rows.length - 1]?.departSec ?? 0)}</span>
          </div>
        </div>
        <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-[11px] text-[var(--landing-ink)]">
          {active ? (
            <>
              <span className="font-medium">Depart {fmtTime(active.departSec)}:</span>{" "}
              <span className="text-[var(--landing-muted)]">{sweepRowText(active)}</span>
            </>
          ) : (
            <span className="text-[var(--landing-faint)]">Hover or focus a column for details.</span>
          )}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--landing-faint)]">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: "repeating-linear-gradient(45deg, var(--landing-accent) 0 2px, color-mix(in oklab, var(--landing-accent) 35%, transparent) 2px 4px)" }}
          />
          Hatched: no journey on the existing network.
        </p>
      </figure>

      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--landing-muted)]">Show as table</summary>
        <table className="mt-2 w-full text-left text-[11px]">
          <thead className="text-[var(--landing-faint)]">
            <tr>
              <th className="py-1 font-medium">Depart</th>
              <th className="py-1 font-medium">Existing</th>
              <th className="py-1 font-medium">With {name}</th>
              <th className="py-1 font-medium">Saved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--landing-border)] text-[var(--landing-ink)]">
            {rows.map((r) => (
              <tr key={r.departSec}>
                <td className="py-1">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => onPickDeparture(r.departSec)}>
                    {fmtTime(r.departSec)}
                  </button>
                </td>
                <td className="py-1">{r.baseTotalSec === null ? "None" : `${fmtDuration(r.baseTotalSec)} · ${r.baseTransfers} tr.`}</td>
                <td className="py-1">{r.withTotalSec === null ? "None" : `≈ ${fmtDuration(r.withTotalSec)} · ${r.withTransfers} tr.`}</td>
                <td className="py-1">{r.timeSavedSec ? `≈ ${fmtDuration(r.timeSavedSec)}` : r.verdict === "new-connection" ? "New" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="text-[10px] leading-relaxed text-[var(--landing-faint)]">
        Each departure is searched separately: vehicles leaving within {limits.horizonSec / 3600} h, up to{" "}
        {limits.maxTransfers} transfers. Times with your route are estimates when it has no timetable.
      </p>
    </div>
  );
}

function sweepRowText(r: SweepRow): string {
  switch (r.verdict) {
    case "new-connection":
      return `Only possible with your route (≈ ${fmtDuration(r.withTotalSec ?? 0)})`;
    case "no-journey":
      return "No journey on either network";
    case "faster":
      return `Saves ≈ ${fmtDuration(r.timeSavedSec ?? 0)} (${fmtDuration(r.baseTotalSec ?? 0)} → ${fmtDuration(r.withTotalSec ?? 0)})`;
    case "fewer-transfers":
      return `Same time, ${(r.baseTransfers ?? 0) - (r.withTransfers ?? 0)} fewer transfer(s)`;
    default:
      return `No improvement (${fmtDuration(r.baseTotalSec ?? 0)})`;
  }
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-3 py-2">
      <dt className="text-[9px] uppercase tracking-[0.06em] text-[var(--landing-faint)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-[var(--landing-ink)]">{value}</dd>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

type Mode = "single" | "sweep";
const STEP_OPTIONS = [10, 15, 30, 60];
const MAX_SWEEP_HOURS = 12;

export default function TestRouteModal({ route, open, onClose, onPickOnMap, onShowOnMap }: TestRouteModalProps) {
  const { state, run } = useJourneyTest();
  const [goStops, setGoStops] = useState<PlaceOption[]>([]);
  const [date, setDate] = useState(todayLocal);
  const [mode, setMode] = useState<Mode>("single");
  const [time, setTime] = useState("08:00");
  const [rangeStart, setRangeStart] = useState("06:00");
  const [rangeEnd, setRangeEnd] = useState("10:00");
  const [stepMin, setStepMin] = useState(15);
  const [asked, setAsked] = useState<{ departSec: number; date: string } | null>(null);

  const routeStops = useMemo<PlaceOption[]>(
    () =>
      [...(route?.stops ?? [])]
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({ key: `route:${s.id}`, group: "route", name: s.name, lat: s.lat, lon: s.lon })),
    [route],
  );
  // Start from the route's terminals; the parent remounts this per route.
  const [origin, setOrigin] = useState<PlaceOption | null>(() => routeStops[0] ?? null);
  const [destination, setDestination] = useState<PlaceOption | null>(() => routeStops[routeStops.length - 1] ?? null);

  useEffect(() => {
    if (!route || goStops.length > 0) return;
    let cancelled = false;
    fetch("/gotransit/derived/stops_lookup.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, { lat: number; lon: number; name: string }>) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const list: PlaceOption[] = [];
        for (const [id, s] of Object.entries(data)) {
          if (seen.has(s.name)) continue;
          seen.add(s.name);
          list.push({ key: `go:${id}`, group: "go", name: s.name, lat: s.lat, lon: s.lon });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setGoStops(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [route, goStops.length]);

  const options = useMemo(() => [...routeStops, ...goStops], [routeStops, goStops]);
  const running = state.status === "running";
  const rangeError =
    mode === "sweep"
      ? timeToSeconds(rangeEnd) <= timeToSeconds(rangeStart)
        ? "End time must be after start time."
        : timeToSeconds(rangeEnd) - timeToSeconds(rangeStart) > MAX_SWEEP_HOURS * 3600
          ? `Keep the range to ${MAX_SWEEP_HOURS} hours or less.`
          : null
      : null;
  const canRun = Boolean(route && origin && destination && date && !running && !rangeError);

  /** Name a clicked map point after the nearest known stop. */
  const placeFromMap = (lat: number, lon: number): PlaceOption => {
    let best: PlaceOption | null = null;
    let bestD = Infinity;
    for (const o of options) {
      const d = haversineM({ lat, lon }, o);
      if (d < bestD) { bestD = d; best = o; }
    }
    const name = best && bestD <= 400 ? `Near ${best.name}` : `Map point (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    return { key: `map:${lat},${lon}`, group: "map", name, lat, lon };
  };

  const toPlace = (p: PlaceOption) => ({ name: p.name, lat: p.lat, lon: p.lon });

  const runSingle = (departSec: number) => {
    if (!route || !origin || !destination) return;
    setAsked({ departSec, date });
    run({ kind: "single", date, departSec, origin: toPlace(origin), destination: toPlace(destination), route });
  };

  const submit = () => {
    if (!route || !origin || !destination) return;
    if (mode === "single") {
      runSingle(timeToSeconds(time));
      return;
    }
    const startSec = timeToSeconds(rangeStart);
    setAsked({ departSec: startSec, date });
    run({
      kind: "sweep",
      date,
      startSec,
      endSec: timeToSeconds(rangeEnd),
      stepSec: stepMin * 60,
      origin: toPlace(origin),
      destination: toPlace(destination),
      route,
    });
  };

  const pickDeparture = (departSec: number) => {
    const hh = String(Math.floor(departSec / 3600) % 24).padStart(2, "0");
    const mm = String(Math.floor((departSec % 3600) / 60)).padStart(2, "0");
    setTime(`${hh}:${mm}`);
    setMode("single");
    runSingle(departSec);
  };

  const name = route?.name || "Your route";
  const result = state.status === "done" ? state.result : null;
  const labelClass =
    "mb-1 block font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]";

  return (
    <Dialog open={route !== null && open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="relative px-5 pb-4 pt-4 text-white" style={{ background: "var(--landing-accent)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-white/60">
                Journey test
              </p>
              <DialogTitle className="mt-0.5 text-[17px] font-semibold tracking-tight text-white">
                Does {name} improve this trip?
              </DialogTitle>
              <p className="mt-1 max-w-[28rem] text-[11px] leading-relaxed text-white/80">
                Compares the fastest journey on today&apos;s GO network with the same network plus {name},
                using real departure times and minimum transfer times.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <form onSubmit={(e) => { e.preventDefault(); if (canRun) submit(); }} className="space-y-3">
            <div className="flex items-end gap-2">
              <PlacePicker
                label="From"
                value={origin}
                options={options}
                onChange={setOrigin}
                onPickOnMap={() => onPickOnMap((lat, lon) => setOrigin(placeFromMap(lat, lon)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Swap origin and destination"
                onClick={() => { setOrigin(destination); setDestination(origin); }}
              >
                <ArrowDownUp className="h-3.5 w-3.5 rotate-90" />
              </Button>
              <PlacePicker
                label="To"
                value={destination}
                options={options}
                onChange={setDestination}
                onPickOnMap={() => onPickOnMap((lat, lon) => setDestination(placeFromMap(lat, lon)))}
              />
            </div>

            <div role="radiogroup" aria-label="What to compare" className="inline-flex rounded-lg border border-[var(--landing-border)] p-0.5 text-[11px]">
              {([["single", "One departure"], ["sweep", "Time range"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    mode === value
                      ? "bg-[var(--landing-accent)] text-white"
                      : "text-[var(--landing-muted)] hover:bg-[var(--landing-wash)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[9rem] flex-1">
                <span className={labelClass}>Date</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" required />
              </label>
              {mode === "single" ? (
                <label className="min-w-[7rem] flex-1">
                  <span className={labelClass}>Depart at</span>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs" required />
                </label>
              ) : (
                <>
                  <label className="min-w-[6.5rem] flex-1">
                    <span className={labelClass}>From</span>
                    <Input type="time" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8 text-xs" required />
                  </label>
                  <label className="min-w-[6.5rem] flex-1">
                    <span className={labelClass}>Until</span>
                    <Input type="time" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8 text-xs" required />
                  </label>
                  <label className="min-w-[5.5rem]">
                    <span className={labelClass}>Every</span>
                    <select
                      value={stepMin}
                      onChange={(e) => setStepMin(Number(e.target.value))}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs"
                    >
                      {STEP_OPTIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                  </label>
                </>
              )}
              <Button type="submit" size="sm" disabled={!canRun} className="h-8">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {running ? "Comparing…" : "Compare journeys"}
              </Button>
            </div>
            {rangeError && <p className="text-[11px] text-[var(--landing-red)]">{rangeError}</p>}
          </form>

          <div aria-live="polite" className="mt-4">
            {state.status === "running" && (
              <p className="flex items-center gap-2 text-xs text-[var(--landing-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {state.phase}…
              </p>
            )}
            {state.status === "error" && (
              <p className="rounded-lg border border-[var(--landing-red)] px-3 py-2 text-xs text-[var(--landing-red)]">
                {state.message}
              </p>
            )}
            {result?.kind === "single" && asked && (
              <Results
                name={name}
                departSec={asked.departSec}
                date={asked.date}
                result={result}
                onShowOnMap={() =>
                  onShowOnMap(
                    result.base.found ? result.base.journey : null,
                    result.withRoute.found ? result.withRoute.journey : null,
                  )
                }
              />
            )}
            {result?.kind === "sweep" && (
              <SweepResults name={name} result={result} onPickDeparture={pickDeparture} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Results({
  name,
  departSec,
  date,
  result,
  onShowOnMap,
}: {
  name: string;
  departSec: number;
  date: string;
  result: JourneyTestResult;
  onShowOnMap: () => void;
}) {
  const { base, withRoute, comparison, feed } = result;
  const verdict = VERDICT[comparison.verdict];
  const toneClass =
    verdict.tone === "good"
      ? "border-[var(--landing-accent)] text-[var(--landing-ink)]"
      : verdict.tone === "bad"
        ? "border-[var(--landing-red)] text-[var(--landing-red)]"
        : "border-[var(--landing-border-2)] text-[var(--landing-ink)]";
  const anyEstimate =
    (base.found && base.journey.hasEstimates) || (withRoute.found && withRoute.journey.hasEstimates);
  const usesCustom = withRoute.found && withRoute.journey.usesCustomRoute;
  const inFeedWeek = feed?.serviceDates.includes(date) ?? false;

  return (
    <div className="space-y-3">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 bg-[var(--landing-wash)] px-3 py-2 ${toneClass}`}>
        <p className="text-xs font-medium">{verdict.text(comparison, name)}</p>
        {(base.found || withRoute.found) && (
          <Button type="button" variant="outline" size="xs" onClick={onShowOnMap}>
            <MapIcon className="h-3 w-3" aria-hidden /> Show on map
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <JourneyCard title="Existing network" result={base} highlight={false} departSec={departSec} />
        <JourneyCard title={`With ${name}`} result={withRoute} highlight={usesCustom} departSec={departSec} />
      </div>
      <FeedNote date={date} feed={feed} anyEstimate={anyEstimate} inFeedWeek={inFeedWeek} />
    </div>
  );
}

function FeedNote({
  date,
  feed,
  anyEstimate,
  inFeedWeek,
}: {
  date: string;
  feed: FeedBasis | null;
  anyEstimate: boolean;
  inFeedWeek: boolean;
}) {
  return (
    <div className="flex gap-2 text-[10px] leading-relaxed text-[var(--landing-faint)]">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <div className="space-y-1">
        {anyEstimate && (
          <p>
            ≈ marks estimated timings. Custom route stop times come from its frequency or departure list plus an
            estimated running time (unless it has a timetable); walks assume 1.2 m/s with a detour allowance.
          </p>
        )}
        <p>
          GO times are for a typical {fmtDate(date).split(",")[0]}
          {feed ? ` from the ${feed.startDate} – ${feed.endDate} timetable` : ""}
          {inFeedWeek ? "" : "; holidays and service changes on this date aren't modelled"}. Transfers need at least
          3 min at the same stop, or the walk time plus 1 min between nearby stops.
        </p>
      </div>
    </div>
  );
}
