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
};

export function NetworksPanel({
  showGoTransit,
  setShowGoTransit,
  showUnionPearson,
  setShowUnionPearson,
  showCustomNetwork,
  setShowCustomNetwork,
  onShowAll,
}: NetworksPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
          Transit Networks
        </h3>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => setShowGoTransit(!showGoTransit)}
          className={`group w-full px-4 py-3.5 rounded-xl text-left font-medium transition-all duration-200 flex items-center justify-between relative overflow-hidden ${
            showGoTransit
              ? "bg-gradient-to-r from-emerald-500/25 to-teal-500/25 shadow-lg shadow-emerald-500/10"
              : "bg-white/5 hover:bg-white/10"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                showGoTransit
                  ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg"
                  : "bg-white/5 group-hover:bg-white/10"
              }`}
            >
              {showGoTransit && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showGoTransit ? "text-white" : "text-neutral-300 group-hover:text-white"
                }`}
              >
                GO Transit
              </div>
              <div className="text-xs text-neutral-500">Regional rail & bus</div>
            </div>
          </div>
          {showGoTransit && (
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none"></div>
          )}
        </button>

        <button
          onClick={() => setShowUnionPearson(!showUnionPearson)}
          className={`group w-full px-4 py-3.5 rounded-xl text-left font-medium transition-all duration-200 flex items-center justify-between relative overflow-hidden ${
            showUnionPearson
              ? "bg-gradient-to-r from-blue-500/25 to-cyan-500/25 shadow-lg shadow-blue-500/10"
              : "bg-white/5 hover:bg-white/10"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                showUnionPearson
                  ? "bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg"
                  : "bg-white/5 group-hover:bg-white/10"
              }`}
            >
              {showUnionPearson && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showUnionPearson ? "text-white" : "text-neutral-300 group-hover:text-white"
                }`}
              >
                UP Express
              </div>
              <div className="text-xs text-neutral-500">Airport rail link</div>
            </div>
          </div>
          {showUnionPearson && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none"></div>
          )}
        </button>

        <button
          onClick={() => setShowCustomNetwork(!showCustomNetwork)}
          className={`group w-full px-4 py-3.5 rounded-xl text-left font-medium transition-all duration-200 flex items-center justify-between relative overflow-hidden ${
            showCustomNetwork
              ? "bg-gradient-to-r from-violet-500/25 to-purple-500/25 shadow-lg shadow-violet-500/10"
              : "bg-white/5 hover:bg-white/10"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                showCustomNetwork
                  ? "bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg"
                  : "bg-white/5 group-hover:bg-white/10"
              }`}
            >
              {showCustomNetwork && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showCustomNetwork ? "text-white" : "text-neutral-300 group-hover:text-white"
                }`}
              >
                Custom Network
              </div>
              <div className="text-xs text-neutral-500">User-created routes</div>
            </div>
          </div>
          {showCustomNetwork && (
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-transparent pointer-events-none"></div>
          )}
        </button>
      </div>

      <div className="pt-3">
        <button
          onClick={onShowAll}
          className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-white/10 to-white/5 text-white hover:from-white/15 hover:to-white/10 transition-all duration-200 border border-white/10 hover:border-white/20 shadow-lg"
        >
          Show All Networks
        </button>
      </div>
    </div>
  );
}
