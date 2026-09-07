import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Page header — title, optional description, optional trailing actions.
 *
 * Every workspace screen opens with exactly one of these. Keeping the shape
 * fixed is what makes the app feel like one product rather than a set of pages
 * that each invented their own top-left corner.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small label above the title — dataset name, section, breadcrumb tail. */
  eyebrow?: React.ReactNode;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/**
 * The standard content column. Caps line length on wide monitors so text stays
 * readable, while tables and maps opt out with `wide`.
 */
export function PageBody({
  className,
  wide,
  ...props
}: React.ComponentProps<"div"> & { wide?: boolean }) {
  return (
    <div
      data-slot="page-body"
      className={cn("space-y-6", wide ? "w-full" : "max-w-5xl", className)}
      {...props}
    />
  )
}
