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
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
          Transit Networks
        </h3>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => setShowGoTransit(!showGoTransit)}
          className={`group w-full px-4 py-3 rounded-lg text-left font-medium transition-all border ${
            showGoTransit
              ? "bg-blue-50 border-blue-200"
              : "bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                showGoTransit
                  ? "bg-blue-600"
                  : "bg-neutral-100 group-hover:bg-neutral-200"
              }`}
            >
              {showGoTransit && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showGoTransit ? "text-blue-900" : "text-neutral-900"
                }`}
              >
                GO Transit
              </div>
              <div className="text-xs text-neutral-600">Regional rail & bus</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setShowUnionPearson(!showUnionPearson)}
          className={`group w-full px-4 py-3 rounded-lg text-left font-medium transition-all border ${
            showUnionPearson
              ? "bg-blue-50 border-blue-200"
              : "bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                showUnionPearson
                  ? "bg-blue-600"
                  : "bg-neutral-100 group-hover:bg-neutral-200"
              }`}
            >
              {showUnionPearson && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showUnionPearson ? "text-blue-900" : "text-neutral-900"
                }`}
              >
                UP Express
              </div>
              <div className="text-xs text-neutral-600">Airport rail link</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setShowCustomNetwork(!showCustomNetwork)}
          className={`group w-full px-4 py-3 rounded-lg text-left font-medium transition-all border ${
            showCustomNetwork
              ? "bg-blue-50 border-blue-200"
              : "bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                showCustomNetwork
                  ? "bg-blue-600"
                  : "bg-neutral-100 group-hover:bg-neutral-200"
              }`}
            >
              {showCustomNetwork && <CheckIcon className="w-5 h-5 text-white" />}
            </div>
            <div>
              <div
                className={`text-sm font-semibold transition-colors ${
                  showCustomNetwork ? "text-blue-900" : "text-neutral-900"
                }`}
              >
                Custom Network
              </div>
              <div className="text-xs text-neutral-600">User-created routes</div>
            </div>
          </div>
        </button>
      </div>

      <div className="pt-3">
        <button
          onClick={onShowAll}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-white text-neutral-700 hover:bg-neutral-100 transition-all border border-neutral-300"
        >
          Show All Networks
        </button>
      </div>
    </div>
  );
}
