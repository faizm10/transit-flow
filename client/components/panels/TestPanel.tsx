"use client";

import { useState } from "react";
import { CalendarClock, ChevronRight, FlaskConical, Network, Pencil, PlayCircle, Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CustomRoute } from "@/lib/gtfs";

interface TestPanelProps {
  customRoutes: CustomRoute[];
  onTestJourney: (routeId: string) => void;
  onCheckImpact: (routeId: string) => void;
  /** Open the simulator, with this route preselected when given. */
  onSimulate: (routeId: string | null) => void;
  onEditTimetable: () => void;
  onDesign: () => void;
}

function ActionRow({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof RouteIcon;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--landing-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--landing-accent)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--landing-wash)] text-[var(--landing-accent)]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-[var(--landing-ink)]">{title}</span>
        <span className="block text-[11px] leading-snug text-[var(--landing-muted)]">{detail}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--landing-faint)]" aria-hidden />
    </button>
  );
}

/**
 * Step 3 of the flow: pick one of your routes, then test it. Journey tests,
 * the network impact report and the simulator all start here.
 */
export default function TestPanel({
  customRoutes,
  onTestJourney,
  onCheckImpact,
  onSimulate,
  onEditTimetable,
  onDesign,
}: TestPanelProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Default to the newest route; fall back if the picked one was deleted.
  const selected =
    customRoutes.find((r) => r.id === pickedId) ?? customRoutes[customRoutes.length - 1] ?? null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-[var(--landing-border)] px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--landing-ink)]">
          <FlaskConical className="h-4 w-4 text-[var(--landing-accent)]" aria-hidden /> Test your route
        </h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--landing-muted)]">
          See whether a design helps real trips before you share it.
        </p>
      </div>

      {customRoutes.length === 0 ? (
        <div className="space-y-3 px-4 py-5 text-center">
          <p className="text-xs leading-relaxed text-[var(--landing-muted)]">
            You haven&apos;t designed a route yet. Design one first, then come back to test it.
          </p>
          <Button size="sm" onClick={onDesign} className="w-full">
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Design a route
          </Button>
          <button
            type="button"
            onClick={() => onSimulate(null)}
            className="text-[11px] font-medium text-[var(--landing-accent)] underline-offset-2 hover:underline"
          >
            Or watch today&apos;s GO service in the simulator
          </button>
        </div>
      ) : (
        <div className="min-h-0 space-y-3 overflow-y-auto px-3 py-3">
          <fieldset>
            <legend className="mb-1.5 px-1 font-[family-name:var(--landing-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--landing-muted)]">
              Route to test
            </legend>
            <div className="max-h-44 divide-y divide-[var(--landing-border)] overflow-y-auto rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)]">
              {customRoutes.map((r) => (
                <label
                  key={r.id}
                  className={`flex cursor-pointer items-center gap-2 px-2.5 py-2 text-xs transition-colors hover:bg-[var(--landing-wash)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[var(--landing-accent)] ${
                    selected?.id === r.id ? "bg-[var(--landing-wash)]" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="test-route"
                    className="sr-only"
                    checked={selected?.id === r.id}
                    onChange={() => setPickedId(r.id)}
                  />
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                    style={{ backgroundColor: r.color }}
                  >
                    {r.type === "train" ? "R" : "B"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--landing-ink)]">{r.name || "Custom route"}</span>
                  <span className="shrink-0 text-[10px] text-[var(--landing-faint)]">{r.stops.length} stops</span>
                  <span
                    aria-hidden
                    className={`h-3 w-3 shrink-0 rounded-full border ${
                      selected?.id === r.id
                        ? "border-[var(--landing-accent)] bg-[var(--landing-accent)] shadow-[inset_0_0_0_2px_var(--landing-elevated)]"
                        : "border-[var(--landing-border-2)]"
                    }`}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {selected && (
            <div className="divide-y divide-[var(--landing-border)] overflow-hidden rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)]">
              <ActionRow
                icon={RouteIcon}
                title="Try a journey"
                detail="Compare one trip, or a range of times, with and without it."
                onClick={() => onTestJourney(selected.id)}
              />
              <ActionRow
                icon={Network}
                title="Check network impact"
                detail="Station-to-station journeys across GO, with and without it."
                onClick={() => onCheckImpact(selected.id)}
              />
              <ActionRow
                icon={PlayCircle}
                title="Simulate service"
                detail="Watch its vehicles run alongside GO on the map."
                onClick={() => onSimulate(selected.id)}
              />
            </div>
          )}

          <details className="group rounded-lg border border-[var(--landing-border)] bg-[var(--landing-elevated)]">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--landing-muted)] marker:hidden">
              <span className="inline-flex items-center gap-1">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden /> More options
              </span>
            </summary>
            <div className="border-t border-[var(--landing-border)]">
              <ActionRow
                icon={CalendarClock}
                title="Edit timetables"
                detail="Change frequency or departure times, or view GO timetables."
                onClick={onEditTimetable}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
