import type { ReactNode } from "react";

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  sub?: string;
}

export function StatCard({ label, value, icon, sub }: Props) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
