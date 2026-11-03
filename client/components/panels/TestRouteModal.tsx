"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Bus,
  Footprints,
  Info,
  Loader2,
  Train,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJourneyTest } from "@/hooks/useJourneyTest";
import { secondsToDisplayTime, timeToSeconds, type CustomRoute } from "@/lib/gtfs";
import type { ComparisonVerdict, JourneyComparison } from "@/lib/journey/planner";
import type { FeedBasis } from "@/lib/journey/protocol";
import type { Journey, JourneyPlace, NoJourneyReason, PlanResult, SearchLimits } from "@/lib/journey/types";

interface TestRouteModalProps {
  /** The route under test; null closes the modal. Key the modal by route id. */
  route: CustomRoute | null;
  onClose: () => void;
}

interface PlaceOption extends JourneyPlace {
  key: string;
  group: "route" | "go";
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
}: {
  label: string;
  value: PlaceOption | null;
  options: PlaceOption[];
  onChange: (p: PlaceOption) => void;
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
        className="h-8 text-xs"
      />
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
                {o.group === "route" ? "Your route" : "GO"}
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

// ── Modal ────────────────────────────────────────────────────────────────────

export default function TestRouteModal({ route, onClose }: TestRouteModalProps) {
  const { state, run } = useJourneyTest();
  const [goStops, setGoStops] = useState<PlaceOption[]>([]);
  const [date, setDate] = useState(todayLocal);
  const [time, setTime] = useState("08:00");
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
  const canRun = Boolean(route && origin && destination && date && time && !running);

  const submit = () => {
    if (!route || !origin || !destination) return;
    const departSec = timeToSeconds(time);
    setAsked({ departSec, date });
    run({
      date,
      departSec,
      origin: { name: origin.name, lat: origin.lat, lon: origin.lon },
      destination: { name: destination.name, lat: destination.lat, lon: destination.lon },
      route,
    });
  };

  const name = route?.name || "Your route";

  return (
    <Dialog open={route !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div
          className="relative px-5 pb-4 pt-4 text-white"
          style={{ background: "var(--landing-accent)" }}
        >
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
          <form
            onSubmit={(e) => { e.preventDefault(); if (canRun) submit(); }}
            className="space-y-3"
          >
            <div className="flex items-end gap-2">
              <PlacePicker label="From" value={origin} options={options} onChange={setOrigin} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Swap origin and destination"
                onClick={() => { setOrigin(destination); setDestination(origin); }}
              >
                <ArrowDownUp className="h-3.5 w-3.5 rotate-90" />
              </Button>
              <PlacePicker label="To" value={destination} options={options} onChange={setDestination} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[9rem] flex-1">
                <span className="mb-1 block font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
                  Date
                </span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" required />
              </label>
              <label className="min-w-[7rem] flex-1">
                <span className="mb-1 block font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
                  Depart at
                </span>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs" required />
              </label>
              <Button type="submit" size="sm" disabled={!canRun} className="h-8">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {running ? "Comparing…" : "Compare journeys"}
              </Button>
            </div>
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
            {state.status === "done" && asked && (
              <Results
                name={name}
                departSec={asked.departSec}
                date={asked.date}
                base={state.result.base}
                withRoute={state.result.withRoute}
                comparison={state.result.comparison}
                feed={state.result.feed}
              />
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
  base,
  withRoute,
  comparison,
  feed,
}: {
  name: string;
  departSec: number;
  date: string;
  base: PlanResult;
  withRoute: PlanResult;
  comparison: JourneyComparison;
  feed: FeedBasis | null;
}) {
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
      <p className={`rounded-lg border-l-4 bg-[var(--landing-wash)] px-3 py-2 text-xs font-medium ${toneClass}`}>
        {verdict.text(comparison, name)}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <JourneyCard title="Existing network" result={base} highlight={false} departSec={departSec} />
        <JourneyCard title={`With ${name}`} result={withRoute} highlight={usesCustom} departSec={departSec} />
      </div>
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
    </div>
  );
}
