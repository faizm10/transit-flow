import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Skeleton — shape-matched loading placeholder.
 *
 * Give it the size of the thing it stands in for. A skeleton that does not
 * match the eventual layout causes a reflow on load, which reads as slower than
 * showing nothing.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

/** Table body placeholder — matches TableCell padding so rows do not jump. */
function SkeletonRows({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className={cn("border-b border-border", className)}>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-3 py-2.5">
              <Skeleton
                className="h-4"
                // Vary widths so the block reads as text, not as a grid.
                style={{ width: `${[80, 55, 40, 65, 30][(r + c) % 5]}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export { Skeleton, SkeletonRows }
