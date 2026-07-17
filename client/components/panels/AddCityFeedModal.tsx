"use client";

import { useCallback, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Check, CloudUpload, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CITY_FEED_COLORS, type CityFeedMeta } from "@/lib/cityGtfs";
import type { ParsedFeed, ParseProgressState } from "@/hooks/useCityFeeds";

interface AddCityFeedModalProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  parseProgress: ParseProgressState | null;
  parseZip: (file: File) => Promise<ParsedFeed>;
  cancelParse: () => void;
  saveFeed: (name: string, color: string, parsed: ParsedFeed) => Promise<CityFeedMeta>;
  addLocalFeed: (name: string, color: string, parsed: ParsedFeed) => CityFeedMeta;
  /** Called with the new feed so the page can fly the map to it */
  onAdded: (meta: CityFeedMeta) => void;
}

const GO_BLUE = "#155ba0";

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fmtCount(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

/** Faint map-grid texture used behind the dropzone (CSS-only). */
const MAP_GRID_BG = {
  backgroundImage:
    "linear-gradient(to right, rgba(21,91,160,0.06) 1px, transparent 1px)," +
    "linear-gradient(to bottom, rgba(21,91,160,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
} as const;

/** Progress stops along the parse "route" (mirrors the worker's phase spans). */
const ROUTE_STOPS = [0, 0.15, 0.9, 1];

export default function AddCityFeedModal({
  open,
  onClose,
  isAuthenticated,
  parseProgress,
  parseZip,
  cancelParse,
  saveFeed,
  addLocalFeed,
  onAdded,
}: AddCityFeedModalProps) {
  const [parsed, setParsed] = useState<ParsedFeed | null>(null);
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(CITY_FEED_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    cancelParse();
    setParsed(null);
    setFileName("");
    setName("");
    setError(null);
    setSaving(false);
    setDragOver(false);
  }, [cancelParse]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setError("Pick a GTFS .zip file");
        return;
      }
      setError(null);
      setFileName(file.name);
      try {
        const result = await parseZip(file);
        setParsed(result);
        setName(
          (result.agency ?? file.name.replace(/\.zip$/i, "").replace(/[_-]+/g, " ")).slice(0, 60)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not parse this zip");
        setFileName("");
      }
    },
    [parseZip]
  );

  const handleAdd = useCallback(
    async (persist: boolean) => {
      if (!parsed || !name.trim() || saving) return;
      setError(null);
      try {
        let meta: CityFeedMeta;
        if (persist) {
          setSaving(true);
          meta = await saveFeed(name.trim(), color, parsed);
        } else {
          meta = addLocalFeed(name.trim(), color, parsed);
        }
        onAdded(meta);
        handleClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add feed");
      } finally {
        setSaving(false);
      }
    },
    [parsed, name, color, saving, saveFeed, addLocalFeed, onAdded, handleClose]
  );

  const parsing = parseProgress !== null;
  const pct = parseProgress?.pct ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {/* ── Header band: transit-sign blue with faint route map ── */}
        <div
          className="relative overflow-hidden px-5 pb-4 pt-4 text-white"
          style={{ background: `linear-gradient(135deg, ${GO_BLUE} 0%, #0d3f73 100%)` }}
        >
          {/* decorative route lines */}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
            viewBox="0 0 400 110"
            preserveAspectRatio="none"
          >
            <path d="M-10 88 L120 88 L170 40 L410 40" fill="none" stroke="white" strokeWidth="2" />
            <path d="M-10 24 L90 24 L150 74 L410 74" fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 5" />
            <circle cx="120" cy="88" r="4" fill="white" />
            <circle cx="170" cy="40" r="4" fill="white" />
            <circle cx="150" cy="74" r="4" fill="white" />
          </svg>

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-blue-200">
                Network import
              </p>
              <DialogTitle className="mt-0.5 text-[17px] font-semibold tracking-tight text-white">
                Add a city&apos;s GTFS
              </DialogTitle>
              <p className="mt-1 max-w-[19rem] text-[11px] leading-relaxed text-blue-100/90">
                Drop in any agency&apos;s GTFS zip — it&apos;s processed in your browser and
                reduced to a compact summary before anything is stored.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="rounded-md p-1 text-blue-100 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-4">
          {/* Step 1 — pick / parse */}
          {!parsed && (
            <>
              <button
                type="button"
                disabled={parsing}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                className={`group relative w-full overflow-hidden rounded-xl border-2 border-dashed px-4 py-9 transition-all duration-200 ${
                  dragOver
                    ? "scale-[1.01] border-[#155ba0] bg-blue-50/70"
                    : "border-slate-200 bg-slate-50/50 hover:border-[#155ba0]/50 hover:bg-blue-50/30"
                } ${parsing ? "cursor-default" : "cursor-pointer"}`}
                style={MAP_GRID_BG}
              >
                {parsing ? (
                  <div className="animate-in fade-in duration-300">
                    {/* route-line progress */}
                    <div className="relative mx-auto mb-5 h-5 w-56">
                      {/* track + fill */}
                      <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-200" />
                      <div
                        className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${pct * 100}%`, backgroundColor: GO_BLUE }}
                      />
                      {/* stop dots */}
                      {ROUTE_STOPS.map((s) => (
                        <span
                          key={s}
                          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white transition-colors duration-300"
                          style={{
                            left: `${s * 100}%`,
                            borderColor: pct >= s ? GO_BLUE : "#cbd5e1",
                          }}
                        />
                      ))}
                      {/* vehicle */}
                      <span
                        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-2 ring-white transition-[left] duration-500 ease-out"
                        style={{ left: `${pct * 100}%`, backgroundColor: GO_BLUE }}
                      />
                    </div>
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#155ba0]">
                      {parseProgress.phase}
                      <span className="ml-2 tabular-nums text-slate-400">
                        {Math.round(pct * 100)}%
                      </span>
                    </p>
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{fileName}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-[#155ba0] transition-transform duration-200 group-hover:-translate-y-0.5"
                      style={{ borderColor: GO_BLUE, backgroundColor: "white" }}
                    >
                      <CloudUpload className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="text-[13px] font-medium text-slate-800">
                      Drop a GTFS <span className="font-mono text-[12px]">.zip</span> here
                    </p>
                    <p className="text-[11px] text-slate-400">
                      or <span className="font-medium text-[#155ba0] underline decoration-dotted underline-offset-2">browse files</span> — large feeds are fine
                    </p>
                  </div>
                )}
              </button>
              <p className="mt-2.5 text-center text-[10px] text-slate-400">
                Find feeds on your city&apos;s open-data portal or{" "}
                <span className="font-medium text-slate-500">mobilitydatabase.org</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </>
          )}

          {/* Step 2 — boarding-pass review */}
          {parsed && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* ticket card */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
                <div className="flex items-stretch">
                  {/* live accent bar */}
                  <span
                    className="w-1.5 shrink-0 transition-colors duration-300"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 px-3.5 py-2.5">
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-slate-400">
                      Agency
                    </p>
                    <p className="truncate text-[14px] font-semibold tracking-tight text-slate-900">
                      {parsed.agency ?? fileName}
                    </p>
                    {parsed.stats.serviceStart && parsed.stats.serviceEnd && (
                      <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] tabular-nums text-slate-500">
                        {parsed.stats.serviceStart}
                        <ArrowRight className="h-2.5 w-2.5 text-slate-300" aria-hidden />
                        {parsed.stats.serviceEnd}
                      </p>
                    )}
                  </div>
                </div>

                {/* perforation */}
                <div className="relative mx-0 flex items-center" aria-hidden>
                  <span className="absolute -left-2 h-4 w-4 rounded-full border border-slate-200 bg-white" />
                  <span className="mx-4 h-px flex-1 border-t border-dashed border-slate-300" />
                  <span className="absolute -right-2 h-4 w-4 rounded-full border border-slate-200 bg-white" />
                </div>

                {/* stat row */}
                <div className="grid grid-cols-4 divide-x divide-slate-200/80 px-1.5 py-2.5">
                  {(
                    [
                      ["Routes", fmtCount(parsed.stats.routes)],
                      ["Stops", fmtCount(parsed.stats.stops)],
                      ["Trips", fmtCount(parsed.stats.trips)],
                      ["Stored", fmtBytes(parsed.gzipped.byteLength)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="px-2 text-center">
                      <p className="font-mono text-[13px] font-semibold tabular-nums tracking-tight text-slate-900">
                        {value}
                      </p>
                      <p className="mt-px font-mono text-[8.5px] font-medium uppercase tracking-[0.18em] text-slate-400">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* name */}
              <div className="mt-4">
                <label
                  htmlFor="city-feed-name"
                  className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500"
                >
                  Display name
                </label>
                <input
                  id="city-feed-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. TTC"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition-shadow placeholder:font-normal placeholder:text-slate-300 focus:border-[#155ba0] focus:ring-2 focus:ring-[#155ba0]/15"
                />
              </div>

              {/* line colour */}
              <div className="mt-3.5">
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">
                  Line colour
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {CITY_FEED_COLORS.map((c) => {
                    const selected = color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Use color ${c}`}
                        aria-pressed={selected}
                        onClick={() => setColor(c)}
                        className={`flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-offset-2 transition-all duration-150 ${
                          selected ? "scale-110" : "ring-transparent hover:scale-105"
                        }`}
                        style={{
                          backgroundColor: c,
                          ...(selected ? { ["--tw-ring-color" as string]: c } : {}),
                        }}
                      >
                        {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* actions */}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  onClick={reset}
                  className="text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                >
                  ← Choose another file
                </button>
                {isAuthenticated ? (
                  <Button
                    size="sm"
                    className="h-8 bg-[#155ba0] px-4 text-xs font-semibold hover:bg-[#12518f]"
                    disabled={!name.trim() || saving}
                    onClick={() => void handleAdd(true)}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                        Saving…
                      </>
                    ) : (
                      "Save to my account"
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-slate-200 text-xs font-medium text-slate-600"
                      disabled={!name.trim()}
                      onClick={() => void handleAdd(false)}
                    >
                      View without saving
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 bg-[#155ba0] px-4 text-xs font-semibold hover:bg-[#12518f]"
                      onClick={() => signIn()}
                    >
                      Sign in to save
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p
              className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
