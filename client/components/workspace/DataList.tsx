import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Key/value data list.
 *
 * This is the answer to "don't put every number in its own oversized card".
 * Grouped label/value rows carry far more information per unit of vertical
 * space than a grid of stat tiles, and they stay readable when a value is
 * missing — which, with GTFS feeds, is often.
 */
export function DataList({
  className,
  columns = 2,
  ...props
}: React.ComponentProps<"dl"> & { columns?: 1 | 2 | 3 }) {
  return (
    <dl
      data-slot="data-list"
      className={cn(
        "grid gap-x-8 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
      {...props}
    />
  );
}

export function DataListItem({
  label,
  value,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div data-slot="data-list-item" className={cn("min-w-0", className)} {...props}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm text-foreground tabular-nums">
        {value}
      </dd>
      {hint && (
        <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>
      )}
    </div>
  );
}

/**
 * A single prominent figure, for the two or three numbers that genuinely lead a
 * page. Deliberately borderless — the hierarchy comes from type size, not from
 * wrapping each number in a box.
 */
export function Metric({
  label,
  value,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div data-slot="metric" className={cn("min-w-0", className)} {...props}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
