"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Dataset sub-navigation.
 *
 * A tab row rather than a second sidebar: the dataset is already the subject of
 * the page, so its sections are peers of each other, not of the workspace.
 *
 * Only sections that exist appear here. Adding "Analytics" or "Settings" tabs
 * that lead nowhere would be inventing features.
 */
const TABS = [
  { segment: "", label: "Overview" },
  { segment: "routes", label: "Routes" },
  { segment: "stops", label: "Stops" },
] as const;

export function DatasetTabs({ datasetId }: { datasetId: string }) {
  const pathname = usePathname();
  const base = `/datasets/${datasetId}`;

  return (
    <div className="-mx-1 overflow-x-auto border-b border-border">
      <nav aria-label="Dataset sections" className="flex gap-1 px-1">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;
          return (
            <Link
              key={tab.segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative shrink-0 px-3 py-2 text-sm transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand transition-opacity duration-150",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
