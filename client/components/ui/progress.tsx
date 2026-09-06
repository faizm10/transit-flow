"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

/**
 * Progress — determinate and indeterminate.
 *
 * Pass a number for real progress, `null` for indeterminate. This distinction
 * is load-bearing in the ingestion UI: upload bytes and archive bytes consumed
 * are genuinely measurable, while index building and analysis are not. Those
 * stages pass `null` and get a moving bar rather than a fabricated percentage.
 */
function Progress({
  className,
  value,
  ...props
}: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("w-full", className)}
      {...props}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-border ring-inset"
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn(
            "h-full rounded-full bg-brand transition-[width] duration-300 ease-out",
            // Determinate: Base UI sets an inline `width: N%` on the
            // indicator, which the width transition above animates.
            // Indeterminate: it sets no width at all, so we give the bar a
            // fixed width and sweep it across the track.
            "data-indeterminate:w-2/5 data-indeterminate:animate-[progress-sweep_1.4s_ease-in-out_infinite]"
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
