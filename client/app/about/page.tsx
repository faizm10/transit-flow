import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Map, Pencil, PlayCircle, Train } from "lucide-react";
import { MAP_LINKS } from "@/lib/mapLinks";

export const metadata: Metadata = {
  title: "About TransitFlow",
  description:
    "Learn what TransitFlow does in simple words: explore GO Transit, design routes, and run basic simulations.",
};

const SIMPLE_STEPS = [
  {
    icon: Map,
    title: "See the network",
    body: "Open the map and look at GO Transit routes, stops, and route options.",
  },
  {
    icon: Pencil,
    title: "Make your own route",
    body: "Create a new bus or train route, add stops, and choose how often it runs.",
  },
  {
    icon: PlayCircle,
    title: "Test the idea",
    body: "Run a simulation to see how the route would move during the day.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <Train className="h-4 w-4 text-white" />
            </div>
            TransitFlow
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
            About
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
            TransitFlow in simple words
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            TransitFlow is a map tool for trying out transit ideas. You can look at the GO
            Transit network, draw your own routes, change stops and schedules, and see how a
            route might run.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {SIMPLE_STEPS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">What you can do here</h2>
          <div className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
            <p>Browse GO train and bus routes on a live map.</p>
            <p>Create your own route from scratch.</p>
            <p>Extend an existing GO line with new stops.</p>
            <p>Change route schedules and departure times.</p>
            <p>Run a basic simulation to watch vehicles move.</p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl bg-emerald-600 p-8 text-white">
          <h2 className="text-2xl font-semibold">Why this project exists</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50">
            It helps people explore transit ideas without needing complicated planning software.
            The goal is to make route planning easier to understand and easier to test.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={MAP_LINKS.welcome}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              Open the map
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={MAP_LINKS.designFresh}
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Start designing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
