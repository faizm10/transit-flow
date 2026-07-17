"use client";

import { useCallback, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { CloudUpload, FileArchive, Loader2, MapPinned } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

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
        // Prefill the label from agency or the file name
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-4 w-4 text-[#155ba0]" aria-hidden />
            Add a city&apos;s GTFS
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload another transit agency&apos;s GTFS zip to overlay it on the GO network.
            It&apos;s processed in your browser — only a compact summary
            (stops, routes, timings) is kept.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: pick / parse ── */}
        {!parsed && (
          <div>
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
              className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragOver
                  ? "border-[#155ba0] bg-blue-50/60"
                  : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
              } ${parsing ? "cursor-default opacity-80" : "cursor-pointer"}`}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-[#155ba0]" aria-hidden />
                  <p className="text-xs font-medium text-slate-700">{parseProgress.phase}…</p>
                  <div
                    className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    aria-valuenow={Math.round(parseProgress.pct * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-[#155ba0] transition-[width] duration-300"
                      style={{ width: `${Math.round(parseProgress.pct * 100)}%` }}
                    />
                  </div>
                  <p className="truncate text-[10px] text-slate-400">{fileName}</p>
                </>
              ) : (
                <>
                  <CloudUpload className="h-6 w-6 text-slate-400" aria-hidden />
                  <p className="text-xs font-medium text-slate-700">
                    Drop a GTFS <span className="font-semibold">.zip</span> here, or click to browse
                  </p>
                  <p className="text-[10px] leading-relaxed text-slate-400">
                    Large files are fine — nothing is uploaded until you save.
                    <br />
                    Find feeds at transitfeeds.com or the Mobility Database.
                  </p>
                </>
              )}
            </button>
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
          </div>
        )}

        {/* ── Step 2: review + save ── */}
        {parsed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
              <FileArchive className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">
                  {parsed.agency ?? fileName}
                </p>
                <p className="text-[10px] tabular-nums text-slate-500">
                  {parsed.stats.routes.toLocaleString()} routes ·{" "}
                  {parsed.stats.stops.toLocaleString()} stops ·{" "}
                  {parsed.stats.trips.toLocaleString()} trips
                  {parsed.stats.serviceStart && parsed.stats.serviceEnd
                    ? ` · ${parsed.stats.serviceStart} → ${parsed.stats.serviceEnd}`
                    : ""}
                </p>
                <p className="text-[10px] text-slate-400">
                  Compacted to {fmtBytes(parsed.gzipped.byteLength)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="city-feed-name" className="text-xs">
                Name
              </Label>
              <Input
                id="city-feed-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. TTC"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Accent color</Label>
              <div className="flex flex-wrap gap-1.5">
                {CITY_FEED_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use color ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      color === c ? "scale-110 border-slate-800" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={reset}>
                Choose another file
              </Button>
              {isAuthenticated ? (
                <Button
                  size="sm"
                  className="h-8 bg-[#155ba0] text-xs hover:bg-[#12518f]"
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
                    className="h-8 text-xs"
                    disabled={!name.trim()}
                    onClick={() => void handleAdd(false)}
                  >
                    View without saving
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 bg-[#155ba0] text-xs hover:bg-[#12518f]"
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
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
