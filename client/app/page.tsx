import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const repoUrl = "https://github.com/faizm10/transit-flow";
  const bugUrl = "https://github.com/faizm10/transit-flow/issues/new";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f8f3] text-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:92px_92px]" />
        <div className="absolute inset-y-0 right-0 w-[46%] opacity-50 [background-image:radial-gradient(circle,rgba(148,163,184,0.34)_1.15px,transparent_1.15px)] [background-size:22px_22px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(134,239,172,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(191,219,254,0.18),transparent_28%),linear-gradient(180deg,rgba(245,248,243,0.94),rgba(245,248,243,0.98))]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-[#d8e2d4] bg-white/88 px-4 py-3 backdrop-blur-xl">
          <div>
            <p className="text-base font-semibold tracking-tight text-slate-950">TransitFlow</p>
            <p className="text-xs text-slate-500">Transit planning workspace</p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href={repoUrl}
              className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-950 sm:block"
            >
              GitHub
            </Link>
            <Button asChild className="h-11 rounded-full bg-[#0b6f3c] px-5 text-white hover:bg-[#095c32]">
              <Link href="/map">
                Open workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-10 lg:grid-cols-[0.78fr_1.22fr] lg:py-14">
          <div className="max-w-xl">
            <div className="inline-flex rounded-full border border-[#cfe0cf] bg-white/82 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0b6f3c]">
              Product board
            </div>

            <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-6xl">
              Plan transit on one board.
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
              Routes, compare, schedules, simulation.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 rounded-full bg-[#0b6f3c] px-6 text-white hover:bg-[#095c32]">
                <Link href="/map">
                  Open map
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#d8e2d4] bg-white/84 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex items-center justify-between rounded-[1.4rem] border border-[#dfe7dd] bg-[#f8fbf7] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Workspace</p>
                <p className="text-xs text-slate-500">Live map shell</p>
              </div>
              <div className="rounded-full bg-[#e9f6ee] px-3 py-1 text-xs font-medium text-[#0b6f3c]">
                Active
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-[#dfe7dd] bg-white">
              <Image
                src="/home-hero-map.png"
                alt="TransitFlow workspace screenshot"
                width={1917}
                height={957}
                priority
                className="h-[330px] w-full object-cover object-center md:h-[460px]"
              />
            </div>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 border-t border-[#d8e2d4] py-6 text-sm text-slate-500 sm:flex-row sm:items-center">
          <p>TransitFlow for route design, comparison, and simulation.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={repoUrl} className="transition hover:text-slate-950">
              GitHub
            </Link>
            <Link href={bugUrl} className="font-medium text-[#0b6f3c] transition hover:text-[#095c32]">
              Report a bug
            </Link>
          </div>
        </footer>

      </div>
    </main>
  );
}
