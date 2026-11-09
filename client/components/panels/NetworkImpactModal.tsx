"use client";

import { useState } from "react";
import { ArrowRight, Info, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatTile } from "@/components/panels/TestRouteModal";
import { useJourneyTest } from "@/hooks/useJourneyTest";
import { timeToSeconds, type CustomRoute } from "@/lib/gtfs";
import { fmtDate, fmtDistance, fmtDuration, fmtTime, todayLocal } from "@/lib/journey/format";
import type { ImpactReport } from "@/lib/journey/impact";
import type { FeedBasis } from "@/lib/journey/protocol";

interface NetworkImpactModalProps {
  /** The route under test; null closes the modal. Key the modal by route id. */
  route: CustomRoute | null;
  onClose: () => void;
}

const STEP_OPTIONS = [15, 30, 60];
const MAX_RANGE_HOURS = 12;

function ServiceChain({ services }: { services: string[] }) {
  if (services.length === 0) return <span>—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {services.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <span aria-hidden className="text-[var(--landing-faint)]">›</span>}
          <span className="rounded bg-[var(--landing-wash)] px-1 font-medium text-[var(--landing-ink)]">{s}</span>
        </span>
      ))}
    </span>
  );
}

function ImpactResults({ name, report, date, feed }: { name: string; report: ImpactReport; date: string; feed: FeedBasis | null }) {
  const r = report;
  const n = (x: number) => x.toLocaleString();
  const changed = r.faster > 0 || r.newlyPossible > 0 || r.fewerTransfers > 0;
  const lastDep = r.departures[r.departures.length - 1] ?? 0;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Journeys faster" value={`${n(r.faster)} of ${n(r.journeysTested)}`} />
        <StatTile label="Avg. saved (faster ones)" value={r.avgSavedSec === null ? "—" : `≈ ${fmtDuration(r.avgSavedSec)}`} />
        <StatTile label="Fewer transfers" value={n(r.fewerTransfers)} />
        <StatTile label="Newly possible" value={`${n(r.newlyPossible)} · ${n(r.newlyPossiblePairs)} pairs`} />
      </dl>

      {!changed && (
        <p className="rounded-lg border-l-4 border-[var(--landing-border-2)] bg-[var(--landing-wash)] px-3 py-2 text-xs text-[var(--landing-ink)]">
          {name} doesn&apos;t change any tested station-to-station journey at these departure times.
        </p>
      )}

      {r.biggest.length > 0 && (
        <section aria-labelledby="impact-biggest">
          <h3 id="impact-biggest" className="font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
            Biggest improvements
          </h3>
          <ol className="mt-1.5 divide-y divide-[var(--landing-border)] rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)]">
            {r.biggest.map((b) => (
              <li key={`${b.from}>${b.to}`} className="flex items-start justify-between gap-3 px-3 py-2 text-[11px]">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-[var(--landing-ink)]">
                    {b.from} <ArrowRight className="inline h-3 w-3 align-[-2px]" aria-label="to" /> {b.to}
                  </p>
                  <p className="text-[var(--landing-muted)]">
                    Depart {fmtTime(b.departSec)} · {fmtDuration(b.baseTotalSec)} → {b.estimated ? "≈ " : ""}
                    {fmtDuration(b.withTotalSec)} · {b.baseTransfers} → {b.withTransfers} transfer{b.withTransfers === 1 ? "" : "s"}
                  </p>
                  <p className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--landing-muted)]">
                    <ServiceChain services={b.baseServices} />
                    <span aria-hidden>→</span>
                    <span className="sr-only">becomes</span>
                    <ServiceChain services={b.withServices} />
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-[color-mix(in_oklab,var(--landing-accent)_12%,transparent)] px-1.5 py-0.5 font-semibold text-[var(--landing-ink)]">
                  {b.estimated ? "≈ " : ""}−{fmtDuration(b.savedSec)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.newConnections.length > 0 && (
        <section aria-labelledby="impact-new">
          <h3 id="impact-new" className="font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
            Newly possible between {fmtTime(r.departures[0] ?? 0)} and {fmtTime(lastDep)}
          </h3>
          <ul className="mt-1.5 divide-y divide-[var(--landing-border)] rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)]">
            {r.newConnections.map((c) => (
              <li key={`${c.from}>${c.to}`} className="space-y-0.5 px-3 py-2 text-[11px]">
                <p className="font-medium text-[var(--landing-ink)]">
                  {c.from} <ArrowRight className="inline h-3 w-3 align-[-2px]" aria-label="to" /> {c.to}
                </p>
                <p className="flex flex-wrap items-center gap-1 text-[var(--landing-muted)]">
                  <span>
                    {c.departures} of {r.departures.length} departures · ≈ {fmtDuration(c.withTotalSec)} from {fmtTime(c.firstDepartSec)} via
                  </span>
                  <ServiceChain services={c.withServices} />
                </p>
              </li>
            ))}
          </ul>
          {r.newlyPossiblePairs > r.newConnections.length && (
            <p className="mt-1 text-[10px] text-[var(--landing-faint)]">
              and {n(r.newlyPossiblePairs - r.newConnections.length)} more station pairs.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="impact-limits" className="rounded-lg border border-[var(--landing-border)] bg-[var(--landing-wash)] px-3 py-2.5">
        <h3 id="impact-limits" className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--landing-ink)]">
          <Info className="h-3 w-3" aria-hidden /> What this does and doesn&apos;t measure
        </h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-[var(--landing-muted)]">
          <li>
            <strong className="font-medium text-[var(--landing-ink)]">Travel options, not passengers.</strong> Every
            station pair and departure counts equally; nothing is weighted by demand or predicts ridership.
          </li>
          <li>
            Tested {n(r.stations.go)} GO rail stations{r.stations.route ? ` and ${r.stations.route} of your route's stops` : ""}:{" "}
            {n(r.pairs)} station pairs × {r.departures.length} departure time{r.departures.length === 1 ? "" : "s"} ={" "}
            {n(r.journeysTested)} journeys. Pairs under {fmtDistance(r.minPairDistanceM)} apart are skipped as walkable.
          </li>
          <li>
            Each journey is the fastest option leaving within {r.limits.horizonSec / 3600} h, with up to{" "}
            {r.limits.maxTransfers} transfers, walks up to {fmtDistance(r.limits.maxAccessWalkM)} to or from stations and{" "}
            {fmtDistance(r.limits.maxTransferWalkM)} between stops. Transfers need at least {r.limits.minTransferSec / 60} min.
            &ldquo;Newly possible&rdquo; means possible within those limits.
          </li>
          <li>
            ≈ marks estimates: {name}&apos;s stop times come from its schedule plus an estimated running time unless it has a timetable.
          </li>
          <li>
            GO times are for a typical {fmtDate(date).split(",")[0]}
            {feed ? ` from the ${feed.startDate} – ${feed.endDate} timetable` : ""}; holidays aren&apos;t modelled.
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function NetworkImpactModal({ route, onClose }: NetworkImpactModalProps) {
  const { state, run } = useJourneyTest();
  const [date, setDate] = useState(todayLocal);
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("09:00");
  const [stepMin, setStepMin] = useState(30);
  const [askedDate, setAskedDate] = useState(date);

  const name = route?.name || "Your route";
  const running = state.status === "running";
  const rangeError =
    timeToSeconds(end) < timeToSeconds(start)
      ? "End time must be after start time."
      : timeToSeconds(end) - timeToSeconds(start) > MAX_RANGE_HOURS * 3600
        ? `Keep the range to ${MAX_RANGE_HOURS} hours or less.`
        : null;
  const departures = rangeError ? 0 : Math.floor((timeToSeconds(end) - timeToSeconds(start)) / (stepMin * 60)) + 1;
  const result = state.status === "done" && state.result.kind === "impact" ? state.result : null;
  const labelClass =
    "mb-1 block font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]";

  const submit = () => {
    if (!route || rangeError) return;
    setAskedDate(date);
    run({ kind: "impact", date, startSec: timeToSeconds(start), endSec: timeToSeconds(end), stepSec: stepMin * 60, route });
  };

  return (
    <Dialog open={route !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="relative px-5 pb-4 pt-4 text-white" style={{ background: "var(--landing-accent)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-white/60">Network impact</p>
              <DialogTitle className="mt-0.5 text-[17px] font-semibold tracking-tight text-white">
                What does {name} change across the network?
              </DialogTitle>
              <p className="mt-1 max-w-[28rem] text-[11px] leading-relaxed text-white/80">
                Compares station-to-station journeys with and without {name} at the same departure times, using GO
                schedules and minimum transfer times.
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
          <form onSubmit={(e) => { e.preventDefault(); if (!running) submit(); }} className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[9rem] flex-1">
                <span className={labelClass}>Date</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" required />
              </label>
              <label className="min-w-[6.5rem] flex-1">
                <span className={labelClass}>Departures from</span>
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 text-xs" required />
              </label>
              <label className="min-w-[6.5rem] flex-1">
                <span className={labelClass}>Until</span>
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 text-xs" required />
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
              <Button type="submit" size="sm" disabled={running || Boolean(rangeError) || !route} className="h-8">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {running ? "Analysing…" : "Run analysis"}
              </Button>
            </div>
            <p className={`text-[11px] ${rangeError ? "text-[var(--landing-red)]" : "text-[var(--landing-faint)]"}`}>
              {rangeError ?? `${departures} departure time${departures === 1 ? "" : "s"} from every GO rail station and your route's stops.`}
            </p>
          </form>

          <div aria-live="polite" className="mt-4">
            {state.status === "running" && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-2 text-xs text-[var(--landing-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {state.phase}…
                  {state.fraction !== undefined && <span className="tabular-nums">{Math.round(state.fraction * 100)}%</span>}
                </p>
                {state.fraction !== undefined && (
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(state.fraction * 100)}
                    className="h-1 overflow-hidden rounded-full bg-[var(--landing-wash)]"
                  >
                    <div className="h-full bg-[var(--landing-accent)] transition-[width]" style={{ width: `${state.fraction * 100}%` }} />
                  </div>
                )}
              </div>
            )}
            {state.status === "error" && (
              <p className="rounded-lg border border-[var(--landing-red)] px-3 py-2 text-xs text-[var(--landing-red)]">{state.message}</p>
            )}
            {result && <ImpactResults name={name} report={result.report} date={askedDate} feed={result.feed} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
