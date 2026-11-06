"use client";

import Link from "next/link";
import { FlaskConical, Map as MapIcon, Pencil, Share2, Train, Users } from "lucide-react";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import BugReportButton from "@/components/BugReportButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CustomRoute } from "@/lib/gtfs";

/** The four steps of the main flow. Share is an action, not a panel. */
export type MapStep = "explore" | "design" | "test";

const STEPS: { step: MapStep; label: string; hint: string; icon: typeof MapIcon }[] = [
  { step: "explore", label: "Explore", hint: "Browse GO lines and timetables", icon: MapIcon },
  { step: "design", label: "Design", hint: "Extend a line or draw a new route", icon: Pencil },
  { step: "test", label: "Test", hint: "Try journeys, network impact and simulation", icon: FlaskConical },
];

interface MapNavProps {
  active: MapStep | null;
  onStep: (step: MapStep) => void;
  customRoutes: CustomRoute[];
  onShare: (route: CustomRoute) => void;
}

function ShareMenu({
  customRoutes,
  onShare,
  onStep,
  triggerClassName,
  side,
}: Pick<MapNavProps, "customRoutes" | "onShare" | "onStep"> & { triggerClassName: string; side: "top" | "bottom" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClassName} aria-label="Share a route">
        <StepNumber n={4} />
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        <span>Share</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-60">
        {customRoutes.length === 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Nothing to share yet. Design a route first.
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onStep("design")}>
              <Pencil aria-hidden /> Design a route
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Share to the community</DropdownMenuLabel>
            {customRoutes.map((r) => (
              <DropdownMenuItem key={r.id} onClick={() => onShare(r)}>
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{ backgroundColor: r.color }}
                >
                  {r.type === "train" ? "R" : "B"}
                </span>
                <span className="truncate">{r.name || "Custom route"}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/community" />}>
          <Users aria-hidden /> Browse community designs
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden className="hidden text-[9px] tabular-nums opacity-50 md:inline">
      {n}
    </span>
  );
}

/**
 * Explore → Design → Test → Share. A top bar on desktop; on phones the steps
 * move to a bottom tab bar so they stay reachable with a thumb and the map
 * keeps the middle of the screen.
 */
export default function MapNav({ active, onStep, customRoutes, onShare }: MapNavProps) {
  const desktopItem = (isActive: boolean) =>
    `tf-map-label flex items-center gap-1.5 px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] ${
      isActive
        ? "bg-[var(--landing-inverse)] text-[var(--landing-inverse-fg)]"
        : "text-[var(--landing-muted)] hover:bg-[var(--landing-wash)] hover:text-[var(--landing-ink)]"
    }`;
  const mobileItem = (isActive: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--landing-accent)] ${
      isActive ? "text-[var(--landing-accent)]" : "text-[var(--landing-muted)]"
    }`;

  return (
    <>
      {/* ── Brand: part of the top bar on desktop, a corner chip on mobile ── */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-30 hidden -translate-x-1/2 md:block">
        <nav aria-label="TransitFlow steps" className="tf-map-panel pointer-events-auto flex items-center gap-0.5 px-1.5 py-1.5">
          <Link href="/" className="mr-1.5 flex items-center gap-2 border-r border-[var(--landing-border)] py-1 pl-1 pr-3">
            <span className="flex h-6 w-6 items-center justify-center bg-[var(--landing-accent)]">
              <Train className="h-3.5 w-3.5 text-white" aria-hidden />
            </span>
            <span className="tf-map-label font-medium text-[var(--landing-ink)]">TransitFlow</span>
          </Link>
          {STEPS.map(({ step, label, hint, icon: Icon }, i) => (
            <button
              key={step}
              type="button"
              title={hint}
              aria-current={active === step ? "step" : undefined}
              onClick={() => onStep(step)}
              className={desktopItem(active === step)}
            >
              <StepNumber n={i + 1} />
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
          <ShareMenu
            customRoutes={customRoutes}
            onShare={onShare}
            onStep={onStep}
            side="bottom"
            triggerClassName={desktopItem(false)}
          />
          <span className="mx-1 h-5 w-px bg-[var(--landing-border)]" aria-hidden />
          <AnimatedThemeToggler className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink)] [&_svg]:h-3.5 [&_svg]:w-3.5" />
          <BugReportButton variant="icon" />
        </nav>
      </div>

      <div className="tf-map-panel absolute left-2 top-2 z-30 flex items-center gap-1 px-1.5 py-1 md:hidden">
        <Link href="/" className="flex items-center gap-1.5 pr-1" aria-label="TransitFlow home">
          <span className="flex h-6 w-6 items-center justify-center bg-[var(--landing-accent)]">
            <Train className="h-3.5 w-3.5 text-white" aria-hidden />
          </span>
          <span className="tf-map-label font-medium text-[var(--landing-ink)]">TransitFlow</span>
        </Link>
        <AnimatedThemeToggler className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--landing-muted)] [&_svg]:h-3.5 [&_svg]:w-3.5" />
        <BugReportButton variant="icon" />
      </div>

      <nav
        aria-label="TransitFlow steps"
        className="absolute inset-x-0 bottom-0 z-40 flex border-t border-[var(--landing-border-2)] bg-[var(--landing-bg)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {STEPS.map(({ step, label, icon: Icon }) => (
          <button
            key={step}
            type="button"
            aria-current={active === step ? "step" : undefined}
            onClick={() => onStep(step)}
            className={mobileItem(active === step)}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </button>
        ))}
        <ShareMenu
          customRoutes={customRoutes}
          onShare={onShare}
          onStep={onStep}
          side="top"
          triggerClassName={`${mobileItem(false)} [&>svg]:h-5 [&>svg]:w-5`}
        />
      </nav>
    </>
  );
}

/** Height reserved for the mobile bottom tab bar (keep in sync with the nav above). */
export const MOBILE_NAV_OFFSET = "max-md:bottom-[calc(3.75rem+env(safe-area-inset-bottom))]";
