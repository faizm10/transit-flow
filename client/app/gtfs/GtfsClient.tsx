"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import { Upload, CheckCircle, XCircle, Clock, Trash2, Map, Globe, AlertTriangle } from "lucide-react";
import type { FeedMeta } from "@/hooks/useFeed";
import { addLocalFeedId, removeLocalFeedId, myFeedsUrl } from "@/lib/localFeeds";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "processing"; feedId: string; startedAt: number }
  | { phase: "done"; feedId: string }
  | { phase: "error"; message: string };

type UserInfo = { name?: string | null; email?: string | null; image?: string | null } | null;

const MAX_ZIP_BYTES = 500 * 1024 * 1024; // 500 MB — keep in sync with /api/gtfs/upload-token
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // stop polling after 10 minutes
const STALE_PROCESSING_MS = 15 * 60 * 1000; // feeds stuck in "processing" longer than this are likely dead

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isStaleProcessing(feed: FeedMeta): boolean {
  return feed.status === "processing" && Date.now() - new Date(feed.createdAt).getTime() > STALE_PROCESSING_MS;
}

export default function GtfsClient({ user }: { user: UserInfo }) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [feeds, setFeeds]   = useState<FeedMeta[]>([]);
  const [cityName, setCityName] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch(myFeedsUrl());
      if (res.ok) {
        const data = await res.json() as { feeds: FeedMeta[] };
        setFeeds(data.feeds);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  useEffect(() => {
    if (state.phase !== "processing") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const { feedId, startedAt } = state;
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > PROCESSING_TIMEOUT_MS) {
        setState({
          phase: "error",
          message: "Processing is taking longer than expected. Your feed may still finish — check back on this page in a few minutes, or delete it and try again.",
        });
        return;
      }
      const res = await fetch(myFeedsUrl());
      if (!res.ok) return;
      const data = await res.json() as { feeds: FeedMeta[] };
      setFeeds(data.feeds);
      const feed = data.feeds.find(f => f.id === feedId);
      if (feed?.status === "ready") {
        setState({ phase: "done", feedId: feed.id });
      } else if (feed?.status === "failed") {
        setState({
          phase: "error",
          message: feed.errorMessage
            ? `Processing failed: ${feed.errorMessage}`
            : "Processing failed. Please make sure the ZIP is a standard GTFS feed and try again.",
        });
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !cityName.trim()) return;

    // Validate up-front so users get an instant, friendly message instead of a
    // failed network upload.
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setState({ phase: "error", message: "Please choose a GTFS ZIP file (ending in .zip)." });
      return;
    }
    if (file.size === 0) {
      setState({ phase: "error", message: "That file is empty. Please choose a valid GTFS ZIP." });
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setState({
        phase: "error",
        message: `That file is ${formatBytes(file.size)} — the limit is 500 MB. Most agency GTFS feeds are well under this.`,
      });
      return;
    }

    setState({ phase: "uploading", progress: 0 });

    try {
      // Upload directly from browser to Vercel Blob (no API body-size limit)
      const blob = await upload(
        `feeds/raw/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/gtfs/upload-token",
          onUploadProgress: ({ percentage }) => {
            setState({ phase: "uploading", progress: percentage });
          },
        }
      );

      // Register the feed in DB and kick off processing
      const res = await fetch("/api/gtfs/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ blobUrl: blob.url, cityName: cityName.trim() }),
      });
      if (!res.ok) {
        let message = "Registration failed";
        try { message = ((await res.json()) as { error?: string }).error ?? message; } catch {}
        setState({ phase: "error", message });
        return;
      }
      const data = await res.json() as { feedId: string };
      // Remember this feed in the browser — sign-in is currently optional,
      // so localStorage is what ties feeds to "you".
      addLocalFeedId(data.feedId);
      setState({ phase: "processing", feedId: data.feedId, startedAt: Date.now() });
      await loadFeeds();
    } catch (err) {
      // Surface a readable message — e.g. if the upload token endpoint fails
      const msg = err instanceof Error ? err.message : String(err);
      setState({ phase: "error", message: msg });
    }
  }

  async function handleDelete(feedId: string) {
    if (!confirm("Delete this feed? This removes it from the map too.")) return;
    const res = await fetch(`/api/gtfs/feeds/${feedId}`, { method: "DELETE" });
    if (res.ok) removeLocalFeedId(feedId);
    await loadFeeds();
  }

  const busy = state.phase === "uploading" || state.phase === "processing";

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <div className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold">City Transit Feeds</h1>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                {user.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-xs text-white/50 hidden sm:block">
                  {user.name ?? user.email}
                </span>
              </div>
            )}
            <a href="/map" className="text-sm text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
              <Map className="w-4 h-4" /> Back to map
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Upload GTFS Feed</h2>
          <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">City name</label>
              <input
                type="text"
                value={cityName}
                onChange={e => setCityName(e.target.value)}
                placeholder="e.g. Toronto (TTC)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/60"
                required
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">
                GTFS ZIP file <span className="text-white/30">(max 500 MB)</span>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
                className="w-full text-sm text-white/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white file:text-xs file:cursor-pointer hover:file:bg-blue-500"
                required
                disabled={busy}
              />
            </div>

            {state.phase === "error" && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </div>
            )}

            {state.phase === "idle" || state.phase === "error" ? (
              <button
                type="submit"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" /> Upload &amp; process
              </button>
            ) : state.phase === "uploading" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/60">
                    <Clock className="w-4 h-4 animate-spin" />
                    Uploading{fileName ? ` ${fileName}` : ""}…
                  </span>
                  <span className="text-white/50 tabular-nums">{Math.round(state.progress)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>
            ) : state.phase === "processing" ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <Clock className="w-4 h-4 animate-spin" />
                  Upload complete — processing the feed into map-ready data…
                </div>
                <p className="text-xs text-white/40 pl-6">
                  Small feeds take under a minute; big-city bus networks can take a few minutes. You can leave this page — the feed will appear in your list when ready.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" /> Feed ready!{" "}
                <a href={`/map?feed=${state.feedId}&feedMode=city`} className="underline underline-offset-2">
                  Open on map →
                </a>
              </div>
            )}
          </form>
        </section>

        {feeds.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Your Feeds</h2>
            <div className="space-y-3">
              {feeds.map(feed => (
                <div key={feed.id} className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{feed.cityName}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {feed.status === "ready" && feed.routeCount !== null
                        ? `${feed.routeCount} routes · ${feed.stopCount} stops`
                        : isStaleProcessing(feed) ? "Processing seems stuck — delete this feed and re-upload."
                        : feed.status === "processing" ? "Processing…"
                        : feed.status === "failed"     ? (feed.errorMessage ?? "Failed")
                        : feed.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {feed.status === "ready" && (
                      <a
                        href={`/map?feed=${feed.id}&feedMode=city`}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md transition-colors"
                      >
                        <Map className="w-3 h-3" /> Open
                      </a>
                    )}
                    {feed.status === "processing" && !isStaleProcessing(feed) && (
                      <span className="text-xs text-amber-400/70 flex items-center gap-1">
                        <Clock className="w-3 h-3 animate-spin" /> Processing
                      </span>
                    )}
                    {feed.status === "processing" && isStaleProcessing(feed) && (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Stuck
                      </span>
                    )}
                    {feed.status === "failed" && (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                    <button
                      onClick={() => handleDelete(feed.id)}
                      className="p-1.5 text-white/30 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
                      aria-label="Delete feed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="text-sm text-white/40 space-y-1">
          <p>Accepted format: standard <strong className="text-white/50">GTFS ZIP</strong> (routes.txt, trips.txt, stop_times.txt, stops.txt, shapes.txt).</p>
          <p>Download feeds from your transit agency&apos;s open data portal, or from sources like <strong className="text-white/50">Transitland</strong>.</p>
          <p>No account needed — your feeds are remembered in this browser.</p>
        </section>
      </div>
    </div>
  );
}
