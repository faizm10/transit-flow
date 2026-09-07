import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Status indicators.
 *
 * Five tones, one meaning each — so a state reads the same everywhere it
 * appears (dataset row, job header, overview panel). Screens map their domain
 * states onto a tone rather than picking colours: see `datasetTone` and
 * `jobTone` in lib/status.ts, which are the only places that mapping lives.
 *
 * `pulse` is reserved for genuinely in-flight work. A pulsing dot that is not
 * actually moving is a lie about the system's state.
 */

const dotVariants = cva("inline-block size-1.5 shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-muted-foreground",
      info: "bg-info",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
})

export type StatusTone = NonNullable<
  VariantProps<typeof dotVariants>["tone"]
>

function StatusDot({
  className,
  tone,
  pulse,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof dotVariants> & { pulse?: boolean }) {
  return (
    <span
      data-slot="status-dot"
      className={cn("relative inline-flex size-1.5 shrink-0", className)}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden
          className={cn(
            dotVariants({ tone }),
            "absolute inset-0 animate-ping opacity-60 motion-reduce:animate-none"
          )}
        />
      )}
      <span className={cn(dotVariants({ tone }), "relative")} />
    </span>
  )
}

const statusVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-muted-foreground ring-1 ring-border ring-inset",
        info: "bg-info-subtle text-info",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger-subtle text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

function Status({
  className,
  tone,
  pulse,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusVariants> & { pulse?: boolean }) {
  return (
    <span
      data-slot="status"
      className={cn(statusVariants({ tone }), className)}
      {...props}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  )
}

export { Status, StatusDot, dotVariants, statusVariants }
