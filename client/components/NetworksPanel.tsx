"use client";

import { CheckIcon } from "@radix-ui/react-icons";

type NetworksPanelProps = {
  showGoTransit: boolean;
  setShowGoTransit: (value: boolean) => void;
  showUnionPearson: boolean;
  setShowUnionPearson: (value: boolean) => void;
  showCustomNetwork: boolean;
  setShowCustomNetwork: (value: boolean) => void;
  onShowAll: () => void;
  showHeatmap: boolean;
  setShowHeatmap: (value: boolean) => void;
  showCoverage: boolean;
  setShowCoverage: (value: boolean) => void;
};

export function NetworksPanel({
  showGoTransit,
  setShowGoTransit,
  showUnionPearson,
  setShowUnionPearson,
  showCustomNetwork,
  setShowCustomNetwork,
  onShowAll,
  showHeatmap,
  setShowHeatmap,
  showCoverage,
  setShowCoverage,
}: NetworksPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-white/45 bg-white/45 p-4 shadow-[var(--glass-shadow-soft)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Transit networks
        </div>
        <h3 className="mt-2 text-sm font-semibold text-slate-950">
          Turn services and overlays on or off without leaving the map.
        </h3>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setShowGoTransit(!showGoTransit)}
          className={`group w-full rounded-[24px] border px-4 py-4 text-left font-medium transition-all ${
            showGoTransit
              ? "border-sky-200 bg-sky-100/70 shadow-[var(--glass-shadow-soft)]"
              : "border-white/45 bg-white/40 hover:bg-white/55"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                showGoTransit
                  ? "border-sky-200 bg-sky-600 text-white"
                  : "border-white/40 bg-white/55 text-slate-500 group-hover:bg-white/75"
              }`}
            >
              {showGoTransit && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showGoTransit ? "text-slate-950" : "text-slate-900"
                }`}
              >
                GO Transit
              </div>
              <div className="text-xs text-slate-500">Regional rail and bus</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setShowUnionPearson(!showUnionPearson)}
          className={`group w-full rounded-[24px] border px-4 py-4 text-left font-medium transition-all ${
            showUnionPearson
              ? "border-sky-200 bg-sky-100/70 shadow-[var(--glass-shadow-soft)]"
              : "border-white/45 bg-white/40 hover:bg-white/55"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                showUnionPearson
                  ? "border-sky-200 bg-sky-600 text-white"
                  : "border-white/40 bg-white/55 text-slate-500 group-hover:bg-white/75"
              }`}
            >
              {showUnionPearson && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showUnionPearson ? "text-slate-950" : "text-slate-900"
                }`}
              >
                UP Express
              </div>
              <div className="text-xs text-slate-500">Airport rail link</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setShowCustomNetwork(!showCustomNetwork)}
          className={`group w-full rounded-[24px] border px-4 py-4 text-left font-medium transition-all ${
            showCustomNetwork
              ? "border-sky-200 bg-sky-100/70 shadow-[var(--glass-shadow-soft)]"
              : "border-white/45 bg-white/40 hover:bg-white/55"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                showCustomNetwork
                  ? "border-sky-200 bg-sky-600 text-white"
                  : "border-white/40 bg-white/55 text-slate-500 group-hover:bg-white/75"
              }`}
            >
              {showCustomNetwork && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showCustomNetwork ? "text-slate-950" : "text-slate-900"
                }`}
              >
                Custom Network
              </div>
              <div className="text-xs text-slate-500">User-created routes</div>
            </div>
          </div>
        </button>
      </div>

      <div className="rounded-[24px] border border-white/45 bg-white/36 p-4 shadow-[var(--glass-shadow-soft)]">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Overlays
        </h3>
        <div className="space-y-2">
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`group w-full rounded-[22px] border px-4 py-4 text-left font-medium transition-all ${
              showHeatmap
                ? "border-amber-200 bg-amber-100/70"
                : "border-white/45 bg-white/45 hover:bg-white/55"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-lg transition-all ${
                  showHeatmap
                    ? "border-amber-200 bg-amber-500"
                    : "border-white/40 bg-white/55 group-hover:bg-white/75"
                }`}
              >
                {showHeatmap ? (
                  <CheckIcon className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-sm text-slate-500">🔥</span>
                )}
              </div>
              <div>
                <div
                  className={`text-sm font-semibold transition-colors ${
                    showHeatmap ? "text-slate-950" : "text-slate-900"
                  }`}
                >
                  Service Heatmap
                </div>
                <div className="text-xs text-slate-500">Weighted by trip frequency</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowCoverage(!showCoverage)}
            className={`group w-full rounded-[22px] border px-4 py-4 text-left font-medium transition-all ${
              showCoverage
                ? "border-emerald-200 bg-emerald-100/70"
                : "border-white/45 bg-white/45 hover:bg-white/55"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                  showCoverage
                    ? "border-emerald-200 bg-emerald-600"
                    : "border-white/40 bg-white/55 group-hover:bg-white/75"
                }`}
              >
                {showCoverage ? (
                  <CheckIcon className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-sm text-slate-500">📍</span>
                )}
              </div>
              <div>
                <div
                  className={`text-sm font-semibold transition-colors ${
                    showCoverage ? "text-slate-950" : "text-slate-900"
                  }`}
                >
                  Coverage Zones
                </div>
                <div className="text-xs text-slate-500">500m radius per stop</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div>
        <button
          onClick={onShowAll}
          className="w-full rounded-[22px] border border-white/50 bg-white/65 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white/80"
        >
          Show All Networks
        </button>
      </div>
    </div>
  );
}
