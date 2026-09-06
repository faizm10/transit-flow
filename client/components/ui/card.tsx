import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Panel — the one content surface in the workspace.
 *
 * Depth is a 1px border plus a background token, never a stacked shadow. The
 * `sunken` variant is for inset regions (empty states, table wells) and the
 * `plain` variant for grouping without drawing a box, which is the default
 * choice: a border should mean "this content is separable", not "this is a
 * paragraph".
 */
const panelVariants = cva("rounded-xl", {
  variants: {
    variant: {
      default: "border border-border bg-surface-raised",
      sunken: "border border-border bg-surface-sunken",
      plain: "",
    },
  },
  defaultVariants: { variant: "default" },
})

function Panel({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof panelVariants>) {
  return (
    <div
      data-slot="panel"
      className={cn(panelVariants({ variant }), className)}
      {...props}
    />
  )
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-start justify-between gap-4 px-5 pt-4 pb-3",
        className
      )}
      {...props}
    />
  )
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  )
}

function PanelDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function PanelContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-content"
      className={cn("px-5 pb-5", className)}
      {...props}
    />
  )
}

/** Footer rule + muted well, for actions attached to a panel. */
function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-footer"
      className={cn(
        "flex items-center justify-end gap-2 rounded-b-xl border-t border-border bg-surface-sunken px-5 py-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Panel,
  PanelContent,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelTitle,
  panelVariants,
}
