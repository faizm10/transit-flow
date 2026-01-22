"use client"

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
            <Button variant="ghost">Docs</Button>
            <Button variant="outline">Sign in</Button>
            <Button>
              Get started <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </div>
        </div>

        {/* Hero row */}
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Hero" className="min-h-[340px] justify-between">
            <div className="space-y-4">
              <Badge variant="secondary">Real-time transit data</Badge>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                A modern dashboard for public transit.
              </h1>
              <p className="text-muted-foreground max-w-prose text-sm leading-6">
                Use TransitFlow to monitor your fleet, analyze ridership, and communicate with your passengers. Everything is a box: sections, cards, feature blocks, pricing, FAQ.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button>
                  Start building <ArrowRightIcon className="ml-2 size-4" />
                </Button>
                <Button variant="outline">See examples</Button>
              </div>
            </div>

            <div className="text-muted-foreground pt-6 text-xs">
              No gradients. No noise. Just structure.
            </div>
          </Section>

          <Section title="Key Features" className="min-h-[340px]">
            <div className="grid gap-4">
              <DashedCard
                title="Real-time Vehicle Positions"
                desc="Track your vehicles on a map in real-time."
              />
              <DashedCard
                title="Service Alerts"
                desc="Notify your passengers about service changes."
              />
              <DashedCard
                title="Ridership Dashboards"
                desc="Analyze ridership patterns and make data-driven decisions."
              />
            </div>
          </Section>
        </div>

        {/* Features */}
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Section title="Feature 01">
            <FeatureItem
              title="GTFS & GTFS-RT"
              desc="Easily import and process your GTFS and GTFS-RT feeds."
            />
          </Section>
          <Section title="Feature 02">
            <FeatureItem
              title="Custom Visualizations"
              desc="Create custom visualizations to better understand your data."
            />
          </Section>
          <Section title="Feature 03">
            <FeatureItem
              title="Developer API"
              desc="Integrate your existing tools with our powerful developer API."
            />
          </Section>
        </div>

        {/* GO Pulse Section */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Section title="Introducing GO Pulse" className="min-h-[340px] justify-between">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                A transit sandbox for building your own world of commuting.
              </h2>
              <p className="text-muted-foreground max-w-prose text-sm leading-6">
                GO Pulse lets you visualize the GO Transit network, customize routes, add new lines, and simulate future expansions — all on an interactive map. It’s not just about today’s service. It’s about designing what regional transit *could* look like.
              </p>
            </div>
          </Section>
          <Section title="GO Pulse Roadmap" className="min-h-[340px]">
            <div className="grid gap-4">
              <DashedCard
                title="Custom routes and stations"
                desc="Design your own transit lines and station placements."
              />
              <DashedCard
                title="Expansion modeling"
                desc="Simulate the impact of new lines and service changes."
              />
              <DashedCard
                title="Express service overlays"
                desc="Add express services to optimize travel times."
              />
              <DashedCard
                title="Crowd level prediction"
                desc="Predict and visualize passenger density on routes."
              />
            </div>
          </Section>
        </div>

        {/* Pricing row */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Section title="Pricing" className="md:col-span-2">
            <div className="grid gap-4 md:grid-cols-3">
              <PricingCard
                plan="Starter"
                price="$0"
                perks={["Basic dashboard", "Community support", "1 project"]}
              />
              <PricingCard
                plan="Pro"
                price="$19"
                highlight
                perks={["Unlimited projects", "Priority support", "Exports"]}
              />
              <PricingCard
                plan="Team"
                price="$49"
                perks={["Seats + roles", "Audit logs", "SLA support"]}
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

function PricingCard({
  plan,
  price,
  perks,
  highlight,
}: {
  plan: string
  price: string
  perks: string[]
  highlight?: boolean
}) {
  return (
    <Card className={cn("border-dashed", highlight && "ring-1 ring-border")}>
      <CardHeader>
        <CardTitle className="text-base">{plan}</CardTitle>
        <CardDescription className="text-sm">
          <span className="text-foreground font-semibold">{price}</span>
          <span className="text-muted-foreground"> / mo</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {perks.map((p) => (
            <div key={p} className="text-muted-foreground flex items-center gap-2 text-sm">
              <CheckIcon className="size-4" />
              {p}
            </div>
          ))}
        </div>
        <Button className="w-full" variant={highlight ? "default" : "outline"}>
          Choose {plan}
        </Button>
      </CardContent>
    </Card>
  )
}
