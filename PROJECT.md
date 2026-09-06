# TransitFlow — Project Summary

> **Architecture note.** The dataset platform — GTFS ingestion, the worker, the
> normalized schema, and the dataset workspace — is documented separately and
> authoritatively in [`docs/architecture/`](docs/architecture/):
> [00-assessment.md](docs/architecture/00-assessment.md) (why the redesign, what
> was wrong, what was decided) and
> [01-ingestion.md](docs/architecture/01-ingestion.md) (how a feed gets from a
> file picker into queryable tables). The sections below describe the original
> GO-Transit-only application, which still runs at `/map`.

## Overview

TransitFlow is a browser-based GO Transit network design simulator. Users can explore real GO Transit routes on a live map, design their own custom bus or train routes, run time-of-day simulations with real GTFS trip data, and share their network designs with a public community feed.

**Live site:** https://transit-flow-two.vercel.app

---

## What It Does

| Mode | Description |
|------|-------------|
| **Explore** | Browse all 44 GO Transit train and bus routes on a live interactive map powered by real GTFS data |
| **Design** | Draw custom bus or train routes — place stops, set frequency or fixed departure times, drop new stations |
| **Schedules** | Inspect departure times for every GO line or view/edit your own route's timetable |
| **Simulate** | Run a time-of-day simulation and watch ~900 trips animate across the GTHA in real time |
| **Community** | Share your network designs publicly, load routes created by other users |
| **Service Updates** | Live GO Transit service alerts (delays, cancellations) scraped server-side |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, React 19, TypeScript) |
| **Map** | Mapbox GL JS + `@mapbox/mapbox-gl-draw` |
| **Database** | Neon (serverless PostgreSQL) + Drizzle ORM |
| **Auth** | Auth.js (NextAuth) — GitHub + Google OAuth, custom sign-in page |
| **Styling** | Tailwind CSS v4 + shadcn/ui + Base UI + Framer Motion |
| **Hosting** | Vercel (Fluid Compute) |
| **Analytics** | Google Analytics 4 + live README stats via GitHub Actions |
| **CI** | GitHub Actions — lint + build + Playwright e2e on every push |

---

## System Design

```
Browser
  └── Next.js App Router (client/)
        ├── /map              — main map page (Mapbox GL, 2400+ lines of state)
        ├── /community        — public route feed (Neon DB, infinite scroll)
        ├── /service-updates  — server-scraped GO Transit alerts (5-min cache)
        ├── /auth/signin      — custom branded OAuth page
        └── /dashboard        — owner-only analytics dashboard

  API Routes (client/app/api/)
        ├── /simulation       — GTFS trip animation engine
        ├── /route-agent      — Claude AI route suggestions
        ├── /schedule-optimizer — Claude AI timetable optimization
        ├── /gotransit/*      — GTFS data endpoints (stops, variants, heatmap, coverage)
        ├── /community/posts  — CRUD for shared route designs
        ├── /bug-report       — creates GitHub issues via PAT (no account needed)
        └── /service-updates  — cached GO Transit alert JSON

  Data Layer
        ├── Neon PostgreSQL    — user accounts, community posts
        ├── Drizzle ORM        — type-safe schema + queries
        └── /public/gotransit/derived/
              ├── variant_stops.json      — pre-computed stop data per GO variant
              ├── variants_index.json     — route variant index
              ├── variant_lines.geojson   — line geometries
              └── simulation/            — trip animation artifacts (~900 trips)

  GitHub Actions
        ├── client-ci.yml            — lint + build + e2e on PRs/main
        └── update-readme-stats.yml  — hourly GA4 stats → readme.md commit
```

---

## Data Pipeline

There are now two, for different purposes.

**Dataset platform (current).** A user uploads a GTFS archive; it goes directly
to object storage over a resumable multipart upload, and a containerized worker
streams it into normalized Postgres tables. Nothing is committed to git and
nothing is precomputed by hand. See
[docs/architecture/01-ingestion.md](docs/architecture/01-ingestion.md).

**Legacy GO feed (still backing `/map`).** Raw GTFS lives under
`server/data/gotransit/`; derived assets are pre-computed into
`client/public/gotransit/derived/` via Python scripts:

```bash
python3 scripts/build_subroutes.py       # stop data per variant
python3 scripts/build_gtfs_derived.py    # route geometries
python3 scripts/build_simulation_artifacts.py  # trip animation data
```

Or from `client/`: `npm run gtfs:derive`

---

## Key Architectural Decisions

- **The GO feed's data is pre-computed at build time** — no heavy processing at request time. Simulation runs entirely client-side from pre-built JSON artifacts. Imported *datasets* work the other way: normalized in Postgres and queried per request.
- **The map loads a minified geometry layer.** `variant_lines.min.geojson` is 3.0 MB against the 59.3 MB full-precision file, same features, ≤6 m deviation. Regenerate with `npm run gtfs:minify`.
- **Map state lives in a single page** (`/map/page.tsx`) — 2400+ lines managing Mapbox layers, draw mode, route builder, simulation, and GTFS overlays via custom events and `localStorage`.
- **Community routes use optimistic UI** — deletes and posts update the feed immediately before the DB confirms.
- **Service alerts are scraped server-side** with a 5-minute cache — no client requests to gotransit.com.
- **Bug reporting requires no GitHub account** — form POSTs to `/api/bug-report` which creates a GitHub issue via a server-side PAT.
- **Auth guards** use dual-identity check (GitHub login OR Google email) for the owner dashboard.

---

## Environment Variables

```env
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN   — public Mapbox token (map rendering)
MAPBOX_ACCESS_TOKEN               — server-side Mapbox token (static images)
NEXT_PUBLIC_SITE_URL              — canonical URL
AUTH_SECRET                       — NextAuth session secret
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
DATABASE_URL                      — Neon PostgreSQL connection string
GITHUB_BUG_REPORT_TOKEN           — PAT for creating GitHub issues
S3_*                              — object storage for GTFS ingestion
OWNER_GITHUB_LOGINS / OWNER_EMAILS — privileged-surface allowlist
```

See [`.env.example`](.env.example) for the full list and local setup.

---

## Project Structure

```
transit-flow/
├── client/                  — Next.js app (main product)
│   ├── app/                 — App Router pages + API routes
│   ├── components/          — React components
│   ├── lib/                 — shared utilities, DB, auth, GTFS helpers
│   ├── hooks/               — custom React hooks
│   └── public/gotransit/    — pre-computed GTFS data
├── worker/                  — containerized GTFS ingestion worker
├── docs/architecture/       — assessment + ingestion architecture
├── server/data/gotransit/   — raw GTFS feeds (legacy GO pipeline)
├── scripts/                 — Python + Node.js data pipeline scripts
└── .github/workflows/       — CI + README stats automation
```
