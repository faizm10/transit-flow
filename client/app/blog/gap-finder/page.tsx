import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Where should the next route go?",
  description:
    "TransitFlow's Gap Finder ranks the GO corridors that are worst served today — how it's worked out, how to try the beta, and what's coming next.",
  alternates: { canonical: `${SITE_URL}/blog/gap-finder` },
  openGraph: {
    title: "Where should the next route go? — TransitFlow",
    description:
      "How TransitFlow finds the GO corridors that are worst served today.",
    url: `${SITE_URL}/blog/gap-finder`,
  },
};

const serifH = "font-[family-name:var(--font-serif)]";

export default function GapFinderPost() {
  return (
    <article className="mx-auto max-w-[40rem] px-5 pb-28 pt-14 lg:px-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-fg)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Blog
      </Link>

      <header className="mt-10 mb-12 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--landing-muted)]">
          Product <span className="mx-1.5 opacity-50">·</span> September 2026
        </p>
        <h1
          className={`${serifH} mx-auto mt-4 max-w-[15ch] text-[2.4rem] font-light leading-[1.08] tracking-tight text-[var(--landing-ink)] sm:text-[3rem]`}
        >
          Where should the next route go?
        </h1>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--landing-border)] bg-[var(--landing-elevated)] px-3 py-1 text-xs font-medium text-[var(--landing-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--landing-accent)]" />
          Gap Finder · Beta
        </div>
      </header>

      <div className="space-y-6 text-[1.075rem] leading-[1.75] text-[var(--landing-fg)]/85">
        <p className={`${serifH} text-[1.4rem] font-light leading-[1.5] text-[var(--landing-ink)]`}>
          TransitFlow lets anyone design a GO Transit route on a map. The new
          part tells you which routes are worth designing.
        </p>

        <p>
          Across the GTA there are pairs of places that are close on a map but
          painful to travel between on transit — a trip that takes ten minutes
          by car and well over an hour by GO, with two or three transfers. Those
          are the corridors where a new route would help the most.{" "}
          <strong className="font-semibold text-[var(--landing-ink)]">Gap Finder</strong>{" "}
          ranks them for you.
        </p>

        <hr className="my-10 border-[var(--landing-border)]" />

        <h2 className={`${serifH} pt-2 text-[1.5rem] font-normal text-[var(--landing-ink)]`}>
          What it does
        </h2>
        <ul className="space-y-3 pl-0">
          {[
            "Looks at the whole GO network — every station and every scheduled trip.",
            "Finds the town-to-town connections that are the slowest compared to how long they should take.",
            "Lets you jump straight into the route builder for any of them, with the corridor already drawn on the map.",
          ].map((point) => (
            <li key={point} className="relative pl-6">
              <span className="absolute left-0 top-[0.72em] h-1.5 w-1.5 rounded-full bg-[var(--landing-accent)]" />
              {point}
            </li>
          ))}
        </ul>

        <h2 className={`${serifH} pt-6 text-[1.5rem] font-normal text-[var(--landing-ink)]`}>
          How it decides
        </h2>
        <p>
          Think of the network as one big web of connections. For any two
          stations, Gap Finder works out the fastest trip you could actually
          take today — riding, waiting, transferring — and compares it to a
          straight line at highway speed.
        </p>
        <p>
          When the real trip is more than twice as long as the straight line,
          and a lot of people already travel through both ends, that pair goes
          near the top of the list. It&apos;s arithmetic over schedule data —
          no guesswork, and nothing made up.
        </p>

        <div className="my-8 rounded-2xl border border-[color-mix(in_srgb,var(--landing-accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--landing-accent)_7%,var(--landing-bg))] p-6">
          <h2 className={`${serifH} text-[1.4rem] font-normal text-[var(--landing-ink)]`}>
            Try it
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[var(--landing-fg)]/85">
            <li>
              Open the map and click{" "}
              <strong className="font-semibold text-[var(--landing-ink)]">Gap Finder</strong>{" "}
              in the top-left corner.
            </li>
            <li>Pick a corridor. It draws on the map and the numbers explain the case.</li>
            <li>
              Hit{" "}
              <strong className="font-semibold text-[var(--landing-ink)]">Design this route</strong>{" "}
              — you land in the builder with the two endpoints marked. Draw the
              alignment, add stops, set a schedule.
            </li>
          </ol>
          <Link
            href="/map"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--landing-accent)] px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Open the map
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <h2 className={`${serifH} pt-4 text-[1.5rem] font-normal text-[var(--landing-ink)]`}>
          What&apos;s coming
        </h2>
        <ol className="mt-2 space-y-7">
          {[
            {
              title: "See the gaps and build by hand",
              tag: "now — beta",
              body: "The ranked list, the corridor on the map, and a one-click jump into the route builder.",
            },
            {
              title: "Score your route",
              tag: "next",
              body: "After you build a route, the tool re-checks the network and tells you the payoff: minutes saved on that corridor, transfers removed, how many more people get a one-seat ride.",
            },
            {
              title: "Better inputs, and a co-planner",
              tag: "later",
              body: "Real travel-demand data instead of a rough proxy, real driving times instead of a straight line, and an assistant that can draft a first route for you to adjust.",
            },
          ].map((stage, i) => (
            <li key={stage.title} className="relative pl-[3.25rem]">
              <span
                className={`${serifH} absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full border border-[var(--landing-border)] bg-[var(--landing-elevated)] text-[0.95rem] text-[var(--landing-accent)]`}
              >
                {i + 1}
              </span>
              <span className="block font-semibold text-[var(--landing-ink)]">
                {stage.title}
                <span className="ml-2 align-[0.1em] text-[0.7rem] font-medium uppercase tracking-[0.06em] text-[var(--landing-accent)]">
                  {stage.tag}
                </span>
              </span>
              <span className="mt-1 block text-[var(--landing-fg)]/85">{stage.body}</span>
            </li>
          ))}
        </ol>

        <p className="mt-10 border-t border-[var(--landing-border)] pt-6 text-[0.95rem] text-[var(--landing-muted)]">
          The numbers are estimates from a first-pass model — it doesn&apos;t yet
          account for time of day, only suggests bus routes between places that
          already have a GO bus stop, and treats the region as one system
          without agency or municipal boundaries. TransitFlow is a what-if
          sandbox for exploring transit ideas, not a proposal to GO Transit.
        </p>
      </div>
    </article>
  );
}
