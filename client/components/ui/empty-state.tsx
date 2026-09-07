import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Empty state.
 *
 * Every empty state answers two questions: why is this empty, and what do I do
 * next. A title alone answers neither, so `description` and `action` are the
 * expected case rather than the decorated one.
 *
 * `variant="error"` is the same shape in a failure tone — a failed screen is an
 * empty screen with a reason, and giving them different layouts makes the app
 * feel like two products.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: "default" | "error"
}) {
  const isError = variant === "error"
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        isError ? "border-danger/30 bg-danger-subtle/40" : "border-border bg-surface-sunken",
        className
      )}
      {...props}
    >
      {Icon && (
        <Icon
          className={cn(
            "size-5",
            isError ? "text-danger" : "text-muted-foreground"
          )}
        />
      )}
      <div className="space-y-1.5">
        <p
          className={cn(
            "text-sm font-medium",
            isError ? "text-danger" : "text-foreground"
          )}
        >
          {title}
        </p>
        {description && (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1 flex items-center gap-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
