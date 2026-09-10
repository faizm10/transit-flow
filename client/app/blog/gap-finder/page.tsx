import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { corridorImageUrl } from "@/lib/blogMaps";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Where should the next route go?",
  description:
    "TransitFlow's Gap Finder ranks the GO corridors that are served worst today. Two worked examples — the 407 corridor and a weekend Waterloo–Niagara line — plus how it works and what's next.",
  alternates: { canonical: `${SITE_URL}/blog/gap-finder` },
  openGraph: {
    title: "Where should the next route go? — TransitFlow",
    description:
      "How TransitFlow ranks the GO corridors that are served worst today.",
    url: `${SITE_URL}/blog/gap-finder`,
  },
};

// ── Worked-example corridors ──────────────────────────────────────────────────

const corridor407 = {
  path: [
    [-79.68224, 43.45559], // Oakville GO
    [-79.63321, 43.51313], // Clarkson GO
    [-79.71088, 43.65214], // Hurontario @ Hwy 407 park & ride
    [-79.6, 43.72], // 407 alignment
    [-79.52445, 43.78307], // Hwy 407 Bus Terminal
  ] as [number, number][],
  fromLabel: "Oakville GO",
  toLabel: "Hwy 407 Bus Terminal",
};

const corridorNiagara = {
  path: [
    [-80.54055, 43.47444], // University of Waterloo Terminal
    [-79.92257, 43.26173], // McMaster University
    [-79.86919, 43.25328], // Hamilton GO Centre
    [-79.06332, 43.10888], // Niagara Falls GO
  ] as [number, number][],
  fromLabel: "University of Waterloo",
  toLabel: "Niagara Falls GO",
};

const img407 = corridorImageUrl(corridor407, { accent: "0b7a3d" });
const imgNiagara = corridorImageUrl(corridorNiagara, { accent: "8b0a31" });

// ── Small pieces ──────────────────────────────────────────────────────────────

function StatRow({ items }: { items: [string, string][] }) {
  return (
    <dl className="my-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-5 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--landing-muted)]">
            {k}
          </dt>
          <dd className="mt-1 text-[15px] font-medium tabular-nums text-[var(--landing-ink)]">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Figure({
  src,
  alt,
  caption,
}: {
  src: string | null;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="my-7">
      <div className="overflow-hidden rounded-xl border border-[var(--landing-border)] bg-[var(--landing-band)]">
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={1280}
            height={620}
            className="h-auto w-full"
            unoptimized
          />
        ) : (
          <div className="flex aspect-[2/1] items-center justify-center text-sm text-[var(--landing-muted)]">
            map preview unavailable
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-[13.5px] leading-relaxed text-[var(--landing-muted)]">
        {caption}
      </figcaption>
    </figure>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GapFinderPost() {
  return (
    <article className="mx-auto max-w-[48rem] px-6 pb-32 pt-14 lg:px-8">
      <Link
        href="/blog"
        className="text-[14px] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-fg)]"
      >
        ← Blog
      </Link>

      <header className="mb-10 mt-8 border-b border-[var(--landing-border)] pb-10">
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--landing-muted)]">
          <span className="font-medium uppercase tracking-[0.12em] text-[var(--landing-accent)]">
            Product
          </span>
          <span aria-hidden>·</span>
          <span>September 2026</span>
          <span aria-hidden>·</span>
          <span>6 min read</span>
        </div>
        <h1 className="mt-4 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.022em] text-[var(--landing-ink)] sm:text-[3rem]">
          Where should the next route go?
        </h1>
        <p className="mt-5 text-[19px] leading-[1.6] text-[var(--landing-muted)]">
          TransitFlow has always let you draw a route anywhere. Now it can tell
          you where a route is worth drawing.
        </p>
      </header>

      <div className="space-y-6 text-[17px] leading-[1.78] text-[var(--landing-fg)]/90 [&_a]:font-medium [&_a]:text-[var(--landing-accent)] [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-[var(--landing-ink)]">
        <p>
          Right now the map is a blank cheque. You can extend the Kitchener line
          to Cambridge, spin up a Brampton circulator, or connect two suburbs
          that already have four buses between them — and the tool treats all of
          it the same. There has never been a signal for <em>this corridor is
          badly served and a lot of people travel it</em>.
        </p>
        <p>
          That signal is computable. The GO network is a graph, the timetables
          are exact, and &ldquo;how long does it take to get from A to B, and how
          does that compare to a straight line&rdquo; is a shortest-path problem,
          not a judgement call. The new <strong>Gap Finder</strong> panel ranks
          the worst-served corridors and hands you a starting point in the route
          builder.
        </p>

        <h2 className="!mt-14 text-[1.7rem] font-semibold tracking-[-0.018em] text-[var(--landing-ink)]">
          How it works
        </h2>
        <p>
          Every GO station and terminal is a node. Every scheduled trip between
          two stops on a typical weekday becomes an edge, weighted by how long
          the ride takes. Add a flat penalty for each transfer, cap the trip at
          three legs, and you can compute the fastest journey between any two
          points on the network.
        </p>
        <p>
          Compare that journey to the straight-line distance at highway speed.
          When transit takes more than roughly twice as long, and a lot of
          service already runs through both endpoints, the corridor scores
          highly. Near-duplicate corridors collapse to one, radial trips that
          naturally route through Union are dropped, and — since this phase only
          proposes bus routes — both endpoints have to be places a bus can
          actually stop.
        </p>
        <p>
          It&apos;s arithmetic over the schedule data TransitFlow already ships.
          No model, no inference. The <Link href="/blog">methodology</Link> is
          open, and the numbers below come straight out of it.
        </p>

        <h2 className="!mt-14 text-[1.7rem] font-semibold tracking-[-0.018em] text-[var(--landing-ink)]">
          Two corridors it surfaces
        </h2>

        <h3 className="!mt-9 text-[1.3rem] font-semibold text-[var(--landing-ink)]">
          Oakville and Clarkson to the 407
        </h3>
        <p>
          The Lakeshore West line runs a fast, frequent service into downtown
          Toronto. It has almost nothing going the other way. To reach the{" "}
          <a
            href="https://www.metrolinx.com/en/projects-and-programs/407-transitway"
            target="_blank"
            rel="noopener noreferrer"
          >
            407 Transitway
          </a>{" "}
          corridor — the east–west busway that links Brampton, Vaughan and
          Markham — a rider from Oakville or Clarkson today goes inbound to a
          hub, transfers, and doubles back north. The tool flags the pair
          because the fastest path it can find is several times longer than the
          drive.
        </p>

        <Figure
          src={img407}
          alt="Map of a proposed express bus from Oakville and Clarkson GO stations north via Hurontario Street to the Hwy 407 Bus Terminal."
          caption="A candidate alignment: Oakville and Clarkson GO, up Hurontario to the 407 Transitway, ending at the Hwy 407 Bus Terminal."
        />

        <StatRow
          items={[
            ["Straight line", "~31 km"],
            ["Best transit today", "3 transfers"],
            ["A direct 407 express", "~35 min"],
          ]}
        />

        <p>
          A single bus up Hurontario and onto the 407 would put the whole
          Transitway network — and the 400-series park-and-ride lots along it —
          within one seat of the Lakeshore West stations. It&apos;s the kind of
          tangential connection a hub-and-spoke network structurally can&apos;t
          provide, and exactly what{" "}
          <a
            href="https://www.metrolinx.com/en/projects-and-programs/go-expansion"
            target="_blank"
            rel="noopener noreferrer"
          >
            GO Expansion
          </a>{" "}
          keeps identifying as a gap.
        </p>

        <h3 className="!mt-12 text-[1.3rem] font-semibold text-[var(--landing-ink)]">
          Waterloo to Niagara — the weekend case
        </h3>
        <p>
          Kitchener–Waterloo, Hamilton and Niagara are three of the busiest
          leisure-travel markets in the region: two university towns and a
          destination that draws millions of visitors a year. On a weekend,
          getting between them on transit means a transfer at Union and the
          better part of an afternoon.
        </p>

        <Figure
          src={imgNiagara}
          alt="Map of a proposed weekend regional bus from the University of Waterloo through McMaster University and Hamilton GO Centre to Niagara Falls GO."
          caption="A weekend regional line: University of Waterloo → McMaster University → Hamilton GO Centre → Niagara Falls GO."
        />

        <StatRow
          items={[
            ["Straight line", "~126 km"],
            ["Best transit today", "3+ transfers · 3½–4 h"],
            ["Direct via Hwy 403/QEW", "~2 h"],
          ]}
        />

        <p>
          This example also shows the tool&apos;s current blind spot. Gap Finder
          only looks at a weekday timetable, so it can&apos;t see that the demand
          here is a Saturday pattern, not a Tuesday one. A route serving
          students and visitors between the three campuses and the falls would
          barely register on the current score — and it&apos;s one of the
          clearest opportunities on the map. Weekend and time-of-day analysis is
          the next thing on the list.
        </p>

        <h2 className="!mt-14 text-[1.7rem] font-semibold tracking-[-0.018em] text-[var(--landing-ink)]">
          What the panel shows this week
        </h2>
        <p>
          The live ranking mixes a few hand-picked regional corridors (starred)
          with the auto-discovered ones. Near the top right now:
        </p>
        <ul className="my-4 divide-y divide-[var(--landing-border)] rounded-xl border border-[var(--landing-border)] bg-[var(--landing-elevated)]">
          {[
            ["★ Cambridge ↔ Bramalea GO", "no reasonable transit path today"],
            ["★ Kitchener–Waterloo ↔ Niagara Falls", "3 h 27 min · 4 transfers · ~1 h 41 min if direct"],
            ["★ Guelph ↔ Niagara Falls", "2 h 23 min · 3 transfers · ~1 h 26 min if direct"],
            ["★ Guelph ↔ Highway 407", "1 h 12 min · 2 transfers · ~51 min if direct"],
            ["Aldershot ↔ Meadowvale", "1 h 41 min · 2 transfers · ~26 min if direct"],
            ["Cooksville ↔ Georgetown", "1 h 19 min · 3 transfers · ~20 min if direct"],
          ].map(([name, note]) => (
            <li key={name} className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between">
              <span className="text-[15px] font-medium text-[var(--landing-ink)]">{name}</span>
              <span className="text-[13.5px] tabular-nums text-[var(--landing-muted)]">{note}</span>
            </li>
          ))}
        </ul>

        <h2 className="!mt-14 text-[1.7rem] font-semibold tracking-[-0.018em] text-[var(--landing-ink)]">
          What&apos;s next
        </h2>
        <div className="my-4 space-y-5">
          {[
            {
              label: "Now",
              body: "See the ranking, jump into the builder with the corridor's endpoints pre-filled, and design the alignment yourself.",
            },
            {
              label: "Next",
              body: "Score the route you build — re-run the network with it added and report the minutes saved, transfers removed, and residents brought within a short walk of a one-seat ride. Plus weekend and peak-hour analysis.",
            },
            {
              label: "Later",
              body: "Real travel-demand data in place of the current proxy, real road times in place of a straight line, and an assistant that drafts a first route for you to adjust.",
            },
          ].map((stage) => (
            <div
              key={stage.label}
              className="flex gap-4 border-l-2 border-[var(--landing-accent)] pl-4"
            >
              <span className="w-12 shrink-0 pt-0.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--landing-accent)]">
                {stage.label}
              </span>
              <p className="text-[15.5px] leading-relaxed text-[var(--landing-fg)]/85">
                {stage.body}
              </p>
            </div>
          ))}
        </div>

        <h2 className="!mt-14 text-[1.7rem] font-semibold tracking-[-0.018em] text-[var(--landing-ink)]">
          Caveats
        </h2>
        <p className="text-[15.5px] leading-relaxed text-[var(--landing-muted)]">
          The numbers are estimates from a first-pass model. It uses one weekday
          timetable, a straight-line stand-in for driving time, and trip counts
          as a rough proxy for demand — so it under-counts markets that no
          service exists for yet, and it can&apos;t see weekend or seasonal
          patterns. It ignores agency and municipal boundaries. TransitFlow is a
          what-if sandbox for exploring transit ideas, not a proposal to GO
          Transit or Metrolinx.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-[var(--landing-border)] pt-8">
        <Link
          href="/map"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--landing-accent)] px-4 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Open the Gap Finder →
        </Link>
        <span className="text-[14px] text-[var(--landing-muted)]">
          It&apos;s the panel in the top-left of the map.
        </span>
      </div>

      <div className="mt-10 text-[13.5px] leading-relaxed text-[var(--landing-muted)] [&_a]:font-medium [&_a]:text-[var(--landing-accent)] [&_a:hover]:underline">
        <p className="font-medium uppercase tracking-[0.08em]">References</p>
        <ul className="mt-2 space-y-1">
            <li>
              Metrolinx —{" "}
              <a
                href="https://www.metrolinx.com/en/projects-and-programs/407-transitway"
                target="_blank"
                rel="noopener noreferrer"
              >
                407 Transitway
              </a>{" "}
              and{" "}
              <a
                href="https://www.metrolinx.com/en/projects-and-programs/go-expansion"
                target="_blank"
                rel="noopener noreferrer"
              >
                GO Expansion
              </a>
            </li>
            <li>
              GO Transit —{" "}
              <a
                href="https://www.gotransit.com/en/trip-planning/schedules"
                target="_blank"
                rel="noopener noreferrer"
              >
                system schedules
              </a>{" "}
              (the source of the timetable data)
            </li>
            <li>
              Statistics Canada —{" "}
              <a
                href="https://www150.statcan.gc.ca/n1/en/subjects/labour/commuting_to_work"
                target="_blank"
                rel="noopener noreferrer"
              >
                commuting flows
              </a>{" "}
              (the planned demand input)
            </li>
        </ul>
      </div>
    </article>
  );
}
