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
        {/* Main instruction banner — ink fill signals "drawing mode is live" */}
        <div className="flex items-center gap-3 bg-[var(--landing-inverse)] px-5 py-3.5 text-[var(--landing-inverse-fg)] shadow-[0_1px_2px_rgba(19,36,27,0.06),0_14px_34px_-14px_rgba(19,36,27,0.35)]">
          <MousePointer2 className="h-4 w-4 flex-shrink-0 text-[color-mix(in_oklab,var(--landing-accent)_70%,white)]" />
          <span className="font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.08em]">
            {mode === "rail"
              ? "Click to place points for the train line"
              : "Click to place points along the new route"}
          </span>
        </div>

        {/* Animated dotted line hint */}
        {hintVisible && (
          <div className="tf-map-panel flex items-center gap-1.5 px-4 py-2.5 text-xs text-[var(--landing-muted)] animate-in fade-in slide-in-from-top-2">
            <DotLine />
            <span>Double-click or press Enter to finish</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 rounded-none bg-[var(--landing-accent)] font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.08em] text-white shadow-md hover:bg-[var(--landing-accent)] hover:opacity-90"
            onClick={onFinish}
          >
            <Check className="h-3.5 w-3.5" /> Finish drawing
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="tf-map-panel gap-1.5 rounded-none border-[var(--landing-border-2)] font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--landing-ink)]"
            onClick={onCancel}
          >
            <X className="h-3.5 w-3.5" /> Cancel
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
          <div className="h-2 w-2 rounded-full border-2 border-white bg-[var(--landing-accent)] shadow-sm" />
          {i < 3 && (
            <div
              className="flex gap-px"
              style={{ animation: `pulse ${0.6 + i * 0.1}s ease-in-out infinite` }}
            >
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-0.5 w-1 rounded bg-[var(--landing-accent)] opacity-40" />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
