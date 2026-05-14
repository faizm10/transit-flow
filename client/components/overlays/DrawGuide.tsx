"use client";

import { useEffect, useState } from "react";
import { MousePointer2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrawGuideProps {
  onFinish: () => void;
  onCancel: () => void;
  mode?: "rail" | "route";
}

export default function DrawGuide({ onFinish, onCancel, mode = "route" }: DrawGuideProps) {
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        {/* Main instruction banner */}
        <div className="bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl px-5 py-3.5 shadow-xl flex items-center gap-3">
          <MousePointer2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium">
            {mode === "rail"
              ? "Click to place points for the train line"
              : "Click to place points along the new route"}
          </span>
        </div>

        {/* Animated dotted line hint */}
        {hintVisible && (
          <div className="bg-white/90 backdrop-blur-md rounded-xl px-4 py-2.5 shadow-md flex items-center gap-1.5 text-xs text-slate-500 animate-in fade-in slide-in-from-top-2">
            <DotLine />
            <span>
              Double-click or press Enter to finish
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="rounded-full bg-[#007A33] hover:bg-[#005f28] text-white gap-1.5 shadow-md"
            onClick={onFinish}
          >
            <Check className="w-3.5 h-3.5" /> Finish drawing
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full bg-white/90 shadow-md gap-1.5"
            onClick={onCancel}
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function DotLine() {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-0.5">
          <div className="w-2 h-2 rounded-full bg-[#007A33] border-2 border-white shadow-sm" />
          {i < 3 && (
            <div
              className="flex gap-px"
              style={{ animation: `pulse ${0.6 + i * 0.1}s ease-in-out infinite` }}
            >
              {[0, 1, 2].map((j) => (
                <div key={j} className="w-1 h-0.5 rounded bg-[#007A33] opacity-40" />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
