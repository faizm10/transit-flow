"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match nested routes too — `/datasets` should stay lit on `/datasets/abc`. */
  matchNested?: boolean;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchNested) && pathname.startsWith(`${item.href}/`);
}

/**
 * Primary workspace navigation.
 *
 * Selection is a subtle background plus a left rule, not a filled pill — at
 * this density a filled block draws more attention than the content it points
 * at. The rule is the only always-on use of the brand colour in the chrome.
 */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "bg-surface-sunken font-medium text-foreground"
                : "text-muted-foreground hover:bg-surface-sunken/60 hover:text-foreground"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand transition-opacity duration-150",
                active ? "opacity-100" : "opacity-0"
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground/70 group-hover:text-foreground"
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
