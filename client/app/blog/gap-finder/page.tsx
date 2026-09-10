import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { corridorImageUrl } from "@/lib/blogMaps";
import { CornerButton, Eyebrow, SpecMeta } from "@/components/marketing/spec";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transit-flow-two.vercel.app";

export const metadata: Metadata = {
  title: "Where should the next route go?",
  description:
    "TransitFlow's Gap Finder ranks the GO corridors that are served worst today. Two worked examples (the 407 corridor and a weekend Waterloo-to-Niagara line), plus how it works and what's next.",
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

const img407 = corridorImageUrl(corridor407, { accent: "0e7d40" });
const img407Dark = corridorImageUrl(corridor407, { accent: "43b071", theme: "dark" });
const imgNiagara = corridorImageUrl(corridorNiagara, { accent: "0e7d40" });
const imgNiagaraDark = corridorImageUrl(corridorNiagara, { accent: "43b071", theme: "dark" });

// ── Pieces ────────────────────────────────────────────────────────────────────

function StatGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="my-7 grid grid-cols-1 border border-[var(--landing-border)] sm:grid-cols-3">
      {items.map(([k, v], i) => (
        <div
          key={k}
          className={`p-4 ${i > 0 ? "border-t border-[var(--landing-border)] sm:border-l sm:border-t-0" : ""}`}
        >
          <dt className="font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--landing-faint)]">
            {k}
          </dt>
          <dd className="mt-1.5 tabular-nums text-[var(--landing-ink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Figure({
  src,
  srcDark,
  alt,
  caption,
}: {
  src: string | null;
  srcDark?: string | null;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="my-8">
      <div className="border border-[var(--landing-border)] bg-[var(--landing-band)]">
        {src ? (
          <>
            <Image
              src={src}
              alt={alt}
              width={1280}
              height={620}
              className={`h-auto w-full ${srcDark ? "dark:hidden" : ""}`}
              unoptimized
            />
            {srcDark && (
              <Image
                src={srcDark}
                alt={alt}
                width={1280}
                height={620}
                className="hidden h-auto w-full dark:block"
                unoptimized
              />
            )}
          </>
        ) : (
          <div className="flex aspect-2/1 items-center justify-center text-sm text-[var(--landing-faint)]">
            map preview unavailable
          </div>
        )}
      </div>
      <figcaption className="mt-2 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.05em] text-[var(--landing-faint)]">
        <span className="text-[var(--landing-accent)]">/</span> {caption}
      </figcaption>
    </figure>
  );
}

const h2 =
  "mt-16 font-[family-name:var(--font-hanken)] text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-[var(--landing-ink)]";
const h3 =
  "mt-10 font-[family-name:var(--font-hanken)] text-[1.3rem] font-medium tracking-[-0.015em] text-[var(--landing-ink)]";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GapFinderPost() {
  return (
    <article className="mx-auto max-w-[46rem] flex-1 px-5 pb-32 pt-14 lg:px-8">
      <Link
        href="/blog"
        className="font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink)]"
      >
        ← Blog
      </Link>

      <header className="mb-12 mt-8 flex flex-col gap-4 border-b border-[var(--landing-border)] pb-10">
        <SpecMeta items={["10.09.26", "Faiz Mustansar", "Product", "6 min"]} />
        <h1 className="font-[family-name:var(--font-hanken)] text-[2.6rem] font-normal leading-[1.05] tracking-[-0.028em] text-[var(--landing-ink)] sm:text-[3.1rem]">
          Where should the next route go?
        </h1>
        <p className="text-[1.15rem] leading-[1.55] text-[var(--landing-muted)]">
          TransitFlow has always let you draw a route anywhere. Now it can tell
          you where a route is worth drawing.
        </p>
      </header>

      <div className="flex flex-col gap-6 text-[1.0625rem] leading-[1.72] text-[var(--landing-fg)] [&_a]:font-medium [&_a]:text-[var(--landing-accent)] [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-[var(--landing-ink)]">
        <p>
          Right now the map is a blank cheque. You can extend the Kitchener line
          to Cambridge, spin up a Brampton circulator, or connect two suburbs
          that already have four buses between them, and the tool treats all of
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

        <div className="mt-6">
          <Eyebrow>01 / How it works</Eyebrow>
        </div>
        <h2 className={h2}>Timetable in, shortest paths out</h2>
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
          naturally route through Union are dropped, and, since this phase only
          proposes bus routes, both endpoints have to be places a bus can
          actually stop.
        </p>
        <p>
          It&apos;s arithmetic over the schedule data TransitFlow already ships.
          No model, no inference.
        </p>

        <div className="mt-6">
          <Eyebrow>02 / Two corridors it surfaces</Eyebrow>
        </div>

        <h3 className={h3}>Oakville and Clarkson to the 407</h3>
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
          corridor (the east-west busway that links Brampton, Vaughan and
          Markham), a rider from Oakville or Clarkson today goes inbound to a
          hub, transfers, and doubles back north.
        </p>

        <Figure
          src={img407}
          srcDark={img407Dark}
          alt="Map of a proposed express bus from Oakville and Clarkson GO stations north via Hurontario Street to the Hwy 407 Bus Terminal."
          caption="Candidate alignment · Oakville · Clarkson → Hurontario → Hwy 407 Bus Terminal"
        />

        <StatGrid
          items={[
            ["Straight line", "~31 km"],
            ["Best transit today", "3 transfers"],
            ["A direct 407 express", "~35 min"],
          ]}
        />

        <p>
          A single bus up Hurontario and onto the 407 would put the whole
          Transitway network, and the 400-series park-and-ride lots along it,
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

        <h3 className={h3}>Waterloo to Niagara: the weekend case</h3>
        <p>
          Kitchener-Waterloo, Hamilton and Niagara are three of the busiest
          leisure-travel markets in the region: two university towns and a
          destination that draws millions of visitors a year. On a weekend,
          getting between them on transit means a transfer at Union and the
          better part of an afternoon.
        </p>

        <Figure
          src={imgNiagara}
          srcDark={imgNiagaraDark}
          alt="Map of a proposed weekend regional bus from the University of Waterloo through McMaster University and Hamilton GO Centre to Niagara Falls GO."
          caption="Weekend regional line · Waterloo → McMaster → Hamilton → Niagara Falls"
        />

        <StatGrid
          items={[
            ["Straight line", "~126 km"],
            ["Best transit today", "3+ transfers · 3½ to 4 h"],
            ["Direct via Hwy 403/QEW", "~2 h"],
          ]}
        />

        <p>
          This example also shows the tool&apos;s current blind spot. Gap Finder
          only looks at a weekday timetable, so it can&apos;t see that the demand
          here is a Saturday pattern, not a Tuesday one. A route serving students
          and visitors between the three campuses and the falls would barely
          register on the current score, and it&apos;s one of the clearest
          opportunities on the map. Weekend and time-of-day analysis is the next
          thing on the list.
        </p>

        <div className="mt-6">
          <Eyebrow>03 / The list right now</Eyebrow>
        </div>
        <h2 className={h2}>What the panel shows this week</h2>
        <p>
          The live ranking mixes a few hand-picked regional corridors (starred)
          with the auto-discovered ones. Near the top:
        </p>
        <ul className="my-4 border border-[var(--landing-border)]">
          {[
            ["★ Cambridge ↔ Bramalea GO", "no route today"],
            ["★ Kitchener-Waterloo ↔ Niagara Falls", "3 h 27 · 4 transfers · ~1 h 41 direct"],
            ["★ Guelph ↔ Niagara Falls", "2 h 23 · 3 transfers · ~1 h 26 direct"],
            ["★ Guelph ↔ Highway 407", "1 h 12 · 2 transfers · ~51 min direct"],
            ["Aldershot ↔ Meadowvale", "1 h 41 · 2 transfers · ~26 min direct"],
            ["Cooksville ↔ Georgetown", "1 h 19 · 3 transfers · ~20 min direct"],
          ].map(([name, note], i) => (
            <li
              key={name}
              className={`flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between ${
                i > 0 ? "border-t border-[var(--landing-border)]" : ""
              }`}
            >
              <span className="font-medium text-[var(--landing-ink)]">{name}</span>
              <span className="font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.04em] tabular-nums text-[var(--landing-faint)]">
                {note}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <Eyebrow>04 / Roadmap</Eyebrow>
        </div>
        <h2 className={h2}>What&apos;s next</h2>
        <div className="my-4 flex flex-col gap-5">
          {[
            {
              label: "Now",
              body: "See the ranking, jump into the builder with the corridor's endpoints pre-filled, and design the alignment yourself.",
            },
            {
              label: "Next",
              body: "Score the route you build: re-run the network with it added and report the minutes saved, transfers removed, and residents brought within a short walk of a one-seat ride. Plus weekend and peak-hour analysis.",
            },
            {
              label: "Later",
              body: "Real travel-demand data in place of the current proxy, real road times in place of a straight line, and an assistant that drafts a first route for you to adjust.",
            },
          ].map((s) => (
            <div key={s.label} className="flex gap-4 border-l border-[var(--landing-accent)] pl-4">
              <span className="w-11 shrink-0 pt-0.5 font-[family-name:var(--landing-mono)] text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-[var(--landing-accent)]">
                {s.label}
              </span>
              <p className="text-[0.9375rem] leading-relaxed text-[var(--landing-fg)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Eyebrow>05 / Caveats</Eyebrow>
        </div>
        <p className="text-[0.9375rem] leading-relaxed text-[var(--landing-muted)]">
          The numbers are estimates from a first-pass model. It uses one weekday
          timetable, a straight-line stand-in for driving time, and trip counts
          as a rough proxy for demand, so it under-counts markets that no
          service exists for yet, and it can&apos;t see weekend or seasonal
          patterns. It ignores agency and municipal boundaries. TransitFlow is a
          what-if sandbox for exploring transit ideas, not a proposal to GO
          Transit or Metrolinx.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-[var(--landing-border)] pt-8">
        <CornerButton href="/map" solid>
          Open the Gap Finder →
        </CornerButton>
        <span className="text-[0.9375rem] text-[var(--landing-muted)]">
          It&apos;s the panel in the top-left of the map.
        </span>
      </div>

      <div className="mt-10 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase leading-relaxed tracking-[0.05em] text-[var(--landing-faint)]">
        <p>
          <span className="text-[var(--landing-accent)]">/</span> References
        </p>
        <ul className="mt-2 flex flex-col gap-1 normal-case tracking-normal [&_a]:text-[var(--landing-accent)] [&_a:hover]:underline">
          <li>
            Metrolinx:{" "}
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
            GO Transit:{" "}
            <a
              href="https://www.gotransit.com/en/trip-planning/schedules"
              target="_blank"
              rel="noopener noreferrer"
            >
              system schedules
            </a>{" "}
            (the timetable data)
          </li>
          <li>
            Statistics Canada:{" "}
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
