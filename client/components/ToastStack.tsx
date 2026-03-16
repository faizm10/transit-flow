"use client";

import { useEffect } from "react";

export type ToastItem = {
  id: number;
  title: string;
  description: string;
  tone?: "error" | "info" | "success";
  category?: string;
};

type ToastStackProps = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  useEffect(() => {
    if (toasts.length === 0) return;

    const timers = toasts.map((toast) =>
      window.setTimeout(() => onDismiss(toast.id), 6000),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onDismiss, toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[70] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-[24px] border px-4 py-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl ${
            toast.tone === "error"
              ? "border-red-200 bg-white/95"
              : toast.tone === "success"
                ? "border-emerald-200 bg-white/95"
                : "border-white/50 bg-[var(--glass-surface-strong)]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-950">{toast.title}</p>
              <p className="text-xs leading-5 text-slate-600">{toast.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-full px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
