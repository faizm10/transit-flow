"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { } from "@/components/ui/card"
import { ArrowRightIcon, CheckIcon } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="bg-background w-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
        {/* Top bar */}
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="border-border grid size-9 place-items-center rounded-xl border border-dashed">
              <span className="text-sm font-semibold">T</span>
            </div>
            <span className="text-sm font-medium">TransitFlow</span>
            <Badge variant="secondary" className="ml-2">
              beta
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/map">
              <Button variant="ghost">Map</Button>
            </Link>
            <Link href="/info">
              <Button variant="ghost">Routes</Button>
            </Link>
            <Link href="/frequency">
              <Button variant="ghost">Frequency</Button>
            </Link>
            <Link href="/map">
              <Button>
                Explore <ArrowRightIcon className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero row */}
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Hero" className="min-h-[340px] justify-between">
            <div className="space-y-4">
              <Badge variant="secondary">GO Transit Network</Badge>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Build your own transit network.
              </h1>
              <p className="text-muted-foreground max-w-prose text-sm leading-6">
                Visualize GO Transit routes, analyze service patterns, and explore how different route configurations could improve commuter experiences. Interactive maps, route analysis, and frequency insights.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/map">
                  <Button>
                    View Map <ArrowRightIcon className="ml-2 size-4" />
                  </Button>
                </Link>
                <Link href="/info">
                  <Button variant="outline">Route Details</Button>
                </Link>
              </div>
            </div>

            <div className="text-muted-foreground pt-6 text-xs">
              No gradients. No noise. Just structure.
            </div>
          </Section>

          <Section title="Key Features" className="min-h-[340px]">
            <div className="grid gap-4">
              <DashedCard
                title="Interactive Route Map"
                desc="Explore GO Transit routes and Union Pearson Express on an interactive map with filtering and variant selection."
              />
              <DashedCard
                title="Route Analysis"
                desc="View trip durations, stop sequences, and route details for all GO Transit variants."
              />
              <DashedCard
                title="Bidirectional Merging"
                desc="Automatically merged train routes show both directions with intuitive naming."
              />
            </div>
          </Section>
        </div>

        {/* Features */}
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Section title="Feature 01">
            <FeatureItem
              title="GTFS Data Processing"
              desc="Process and analyze GTFS feeds to extract routes, stops, shapes, and trip information."
            />
          </Section>
          <Section title="Feature 02">
            <FeatureItem
              title="Route Variants"
              desc="Automatically identify and group route variants with different stop patterns and directions."
            />
          </Section>
          <Section title="Feature 03">
            <FeatureItem
              title="Map Visualization"
              desc="Interactive Mapbox GL maps with custom styling, filtering, and route selection."
            />
          </Section>
        </div>

        {/* GO Pulse Section */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Section title="Current Features" className="min-h-[340px] justify-between">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Analyze and visualize GO Transit service.
              </h2>
              <p className="text-muted-foreground max-w-prose text-sm leading-6">
                GO Pulse lets you visualize the GO Transit network, customize routes, add new lines, and simulate future expansions — all on an interactive map. It’s not just about today’s service. It’s about designing what regional transit *could* look like.
              </p>
            </div>
          </Section>
          <Section title="Coming Soon" className="min-h-[340px]">
            <div className="grid gap-4">
              <DashedCard
                title="Frequency Analysis"
                desc="Analyze service frequency, headways, and trip patterns for each route and variant."
              />
              <DashedCard
                title="Peak Hour Analysis"
                desc="Identify peak service periods and frequency variations throughout the day."
              />
              <DashedCard
                title="Service Gaps"
                desc="Identify periods with low or no service to highlight improvement opportunities."
              />
              <DashedCard
                title="Route Comparison"
                desc="Compare frequency and service levels across different routes and variants."
              />
            </div>
          </Section>
        </div>

        {/* Data Sources */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Section title="Data Sources" className="md:col-span-2">
            <div className="grid gap-4 md:grid-cols-2">
              <DashedCard
                title="GO Transit GTFS"
                desc="Official GTFS feed from GO Transit including routes, stops, trips, and schedules."
              />
              <DashedCard
                title="Union Pearson Express"
                desc="UPX route and stop data integrated into the transit network visualization."
              />
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-10 flex flex-col gap-3 border-t border-dashed pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} TransitFlow. Built with dashed boxes.
          </p>
          <div className="flex gap-3 text-xs">
            <a className="text-muted-foreground hover:text-foreground" href="#">
              Privacy
            </a>
            <a className="text-muted-foreground hover:text-foreground" href="#">
              Terms
            </a>
            <a className="text-muted-foreground hover:text-foreground" href="#">
              Contact
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Reusable dashed section */
function Section({
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { title?: string }) {
  return (
    <section
      className={cn(
        "bg-background text-foreground flex min-w-0 flex-col gap-6 border border-dashed p-5 sm:p-6",
        className
      )}
      {...props}
    >
      {title ? (
        <div className="text-muted-foreground -mt-1 text-xs font-medium">
          {title}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function DashedCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border-border rounded-xl border border-dashed p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-muted-foreground mt-1 text-sm">{desc}</div>
    </div>
  )
}

function FeatureItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-muted-foreground text-sm leading-6">{desc}</div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="border-border grid size-6 place-items-center rounded-lg border border-dashed">
          <CheckIcon className="size-3" />
        </span>
        clean + structured
      </div>
    </div>
  )
}


