import Link from "next/link";
import { Train, Map, PlayCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ENTRY_CARDS = [
  {
    icon: Map,
    title: "Explore GO routes",
    description: "See all 47 GO Transit lines on the map. Click any line to learn about it.",
    href: "/map?mode=browse",
    borderColor: "border-emerald-200",
    iconBg: "bg-emerald-100 text-emerald-700",
    textColor: "text-emerald-700",
  },
  {
    icon: Train,
    title: "Design a route",
    description: "Sketch a new bus or train line, add stops, and set a schedule.",
    href: "/map?mode=build",
    borderColor: "border-blue-200",
    iconBg: "bg-blue-100 text-blue-700",
    textColor: "text-blue-700",
  },
  {
    icon: PlayCircle,
    title: "Watch it move",
    description: "Simulate GO trains running in real time during morning rush.",
    href: "/map?mode=simulate",
    borderColor: "border-violet-200",
    iconBg: "bg-violet-100 text-violet-700",
    textColor: "text-violet-700",
  },
];

const HOW_IT_WORKS = [
  { step: "1", label: "Explore", text: "Browse all GO Transit routes on an interactive map." },
  { step: "2", label: "Design", text: "Sketch a new route or extend an existing one." },
  { step: "3", label: "Simulate", text: "Watch your route move on a live schedule." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#007A33] flex items-center justify-center">
            <Train className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-900 text-lg">TransitFlow</span>
        </div>
        <Link
          href="/map"
          className={cn(
            buttonVariants(),
            "rounded-full bg-[#007A33] hover:bg-[#005f28] text-white px-5 h-9"
          )}
        >
          Open map <ArrowRight className="ml-1.5 w-4 h-4" />
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-sm font-medium text-emerald-700 mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          GO Transit Network Explorer
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-tight leading-tight mb-5">
          Plan transit.<br />
          <span className="text-[#007A33]">See it move.</span>
        </h1>

        <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed mb-8">
          Explore every GO Transit route, design your own, and simulate how trains and
          buses would run — no technical knowledge needed.
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/map?mode=browse"
            className={cn(
              buttonVariants({ size: "lg" }),
              "rounded-full bg-[#007A33] hover:bg-[#005f28] text-white px-8 h-12"
            )}
          >
            Start exploring <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
          <Link
            href="/map?mode=simulate"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "rounded-full h-12 px-8 border-slate-200 hover:border-slate-300"
            )}
          >
            Watch a simulation
          </Link>
        </div>
      </section>

      {/* Entry Cards */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ENTRY_CARDS.map(({ icon: Icon, title, description, href, borderColor, iconBg, textColor }) => (
            <Link
              key={href}
              href={href}
              className={`group relative rounded-2xl border bg-white p-6 transition-all hover:shadow-md hover:-translate-y-0.5 ${borderColor}`}
            >
              <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-slate-900 text-lg mb-1">{title}</h2>
              <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
              <ArrowRight className={`absolute right-5 top-5 w-4 h-4 ${textColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <h2 className="text-center text-2xl font-semibold text-slate-900 mb-10">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {HOW_IT_WORKS.map(({ step, label, text }) => (
            <div key={step} className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-[#007A33] text-white font-bold text-sm flex items-center justify-center mb-3">
                {step}
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">{label}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-t border-slate-100 bg-slate-50 py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              "47 GO Transit routes",
              "7 rail lines",
              "Real GTFS schedules",
              "Draw new routes",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
        <p>TransitFlow — GO Transit route design &amp; simulation</p>
        <a href="https://github.com/faizm10/transit-flow" className="hover:text-slate-600 transition-colors">
          GitHub
        </a>
      </footer>
    </main>
  );
}
