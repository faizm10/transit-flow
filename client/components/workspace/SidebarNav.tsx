"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Database,
  Map as MapIcon,
  Radio,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Primary workspace navigation.
 *
 * The nav list lives here rather than in the server-rendered shell because an
 * icon is a function, and functions cannot cross the Server/Client boundary —
 * only serializable props can. So the shell passes `isOwner` and this component
 * decides what to render.
 *
 * Selection is a subtle background plus a left rule, not a filled pill: at this
 * density a filled block draws more attention than the content it points at.
 * The rule is the only always-on use of the brand colour in the chrome.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match nested routes too — `/datasets` stays lit on `/datasets/abc`. */
  matchNested?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/datasets", label: "Datasets", icon: Database, matchNested: true },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/community", label: "Community", icon: Users, matchNested: true },
  { href: "/service-updates", label: "Service updates", icon: Radio },
];

const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Analytics", icon: BarChart3 },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchNested) && pathname.startsWith(`${item.href}/`);
}

export function SidebarNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const items = isOwner ? [...PRIMARY_NAV, ...OWNER_NAV] : PRIMARY_NAV;

  return (
    <nav
      aria-label="Workspace"
      // Horizontal, scrollable row on small screens; vertical rail from lg up.
      // A stacked list on a phone spends half the viewport before any content.
      className="-mx-1 flex gap-0.5 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
    >
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "bg-surface-sunken font-medium text-foreground"
                : "text-muted-foreground hover:bg-surface-sunken/60 hover:text-foreground"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute rounded-full bg-brand transition-opacity duration-150",
                "inset-x-2 bottom-0 h-0.5 lg:inset-x-auto lg:inset-y-1 lg:left-0 lg:h-auto lg:w-0.5",
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
