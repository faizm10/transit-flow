"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, CheckCircle, XCircle, Clock, Trash2, Map, Globe, LogIn } from "lucide-react";
import type { FeedMeta } from "@/hooks/useFeed";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "processing"; feedId: string }
  | { phase: "done"; feedId: string }
  | { phase: "error"; message: string }
  | { phase: "unauthenticated" };

export default function GtfsPage() {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [feeds, setFeeds]   = useState<FeedMeta[]>([]);
  const [cityName, setCityName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch("/api/gtfs/feeds");
      if (res.ok) {
        const data = await res.json() as { feeds: FeedMeta[] };
        setFeeds(data.feeds);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  // Poll while a feed is processing
  useEffect(() => {
    if (state.phase !== "processing") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      await loadFeeds();
      const res = await fetch("/api/gtfs/feeds");
      if (!res.ok) return;
      const data = await res.json() as { feeds: FeedMeta[] };
      const feed = data.feeds.find(f => f.id === (state as { feedId: string }).feedId);
      if (feed?.status === "ready") {
        setState({ phase: "done", feedId: feed.id });
        setFeeds(data.feeds);
      } else if (feed?.status === "failed") {
        setState({ phase: "error", message: "Processing failed. Please try again." });
        setFeeds(data.feeds);
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, loadFeeds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !cityName.trim()) return;

    setState({ phase: "uploading" });

    const fd = new FormData();
    fd.append("file", file);
    fd.append("cityName", cityName.trim());

    try {
      const res = await fetch("/api/gtfs/upload", { method: "POST", body: fd });
      if (res.status === 401) {
        setState({ phase: "unauthenticated" });
        return;
      }
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setState({ phase: "error", message: err.error ?? "Upload failed" });
        return;
      }
      const data = await res.json() as { feedId: string };
      setState({ phase: "processing", feedId: data.feedId });
    } catch (err) {
      setState({ phase: "error", message: String(err) });
    }
  }

  async function handleDelete(feedId: string) {
    if (!confirm("Delete this feed?")) return;
    await fetch(`/api/gtfs/feeds/${feedId}`, { method: "DELETE" });
    await loadFeeds();
  }

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold">City Transit Feeds</h1>
          </div>
          <a href="/map" className="text-sm text-white/50 hover:text-white transition-colors flex items-center gap-1.5">
            <Map className="w-4 h-4" /> Back to map
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {/* Upload form */}
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
                disabled={state.phase === "uploading" || state.phase === "processing"}
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">GTFS ZIP file <span className="text-white/30">(max 500 MB)</span></label>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="w-full text-sm text-white/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white file:text-xs file:cursor-pointer hover:file:bg-blue-500"
                required
                disabled={state.phase === "uploading" || state.phase === "processing"}
              />
            </div>

            {state.phase === "error" && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {state.message}
              </div>
            )}

            {state.phase === "unauthenticated" && (
              <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <LogIn className="w-4 h-4 shrink-0" />
                <span>
                  You need to{" "}
                  <a href="/auth/signin" className="underline underline-offset-2 hover:text-amber-300 transition-colors">
                    sign in
                  </a>{" "}
                  to upload GTFS feeds.
                </span>
              </div>
            )}

            {(state.phase === "idle" || state.phase === "error" || state.phase === "unauthenticated") ? (
              <button
                type="submit"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" /> Upload & process
              </button>
            ) : state.phase === "uploading" ? (
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <Clock className="w-4 h-4 animate-spin" /> Uploading…
              </div>
            ) : state.phase === "processing" ? (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <Clock className="w-4 h-4 animate-spin" />
                Processing GTFS data — this may take a few minutes for large feeds…
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" /> Feed ready!{" "}
                <a href="/map" className="underline underline-offset-2">Open on map →</a>
              </div>
            )}
          </form>
        </section>

        {/* Feed list */}
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
                        : feed.status === "processing" ? "Processing…"
                        : feed.status === "failed" ? "Failed"
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
                    {feed.status === "processing" && (
                      <span className="text-xs text-amber-400/70 flex items-center gap-1">
                        <Clock className="w-3 h-3 animate-spin" /> Processing
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

        {/* Info section */}
        <section className="text-sm text-white/40 space-y-1">
          <p>Accepted format: standard <strong className="text-white/50">GTFS ZIP</strong> (routes.txt, trips.txt, stop_times.txt, stops.txt, shapes.txt).</p>
          <p>Download feeds from your transit agency's open data portal, or from sources like <strong className="text-white/50">Transitland</strong>.</p>
        </section>
      </div>
    </div>
  );
}
