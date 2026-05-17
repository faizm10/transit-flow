# TransitFlow (client)

Next.js app: marketing pages, interactive map (`/map`), API routes, and prebuilt GO Transit assets under `public/gotransit/`.

## Prerequisites

- Node.js 20+
- Python 3 (only if you regenerate GTFS-derived files — see [../readme.md](../readme.md))

## Setup

```bash
npm install
npm run dev
```

- App: [http://localhost:3000](http://localhost:3000)
- Map: [http://localhost:3000/map](http://localhost:3000/map)

Create `client/.env.local` with at least:

```env
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
MAPBOX_ACCESS_TOKEN=

# Optional — community / saved routes
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
DATABASE_URL=
```

Mapbox tokens are required for the interactive map. Auth and `DATABASE_URL` are only needed for features that persist data (e.g. community routes).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Typecheck (`tsc`) |
| `npm run test:e2e` | Playwright tests |
| `npm run gtfs:derive` | Run `scripts/build_gtfs_derived.py` |
| `npm run video:preview` | Remotion studio |
| `npm run video:render` | Export demo video to `public/demo.mp4` |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Mapbox GL · NextAuth · Neon Postgres · Drizzle ORM

## Project layout (high level)

```
app/           Routes (marketing, /map, API)
components/    UI and map panels
lib/           Auth, DB, GTFS helpers, server utilities
public/        Static assets + gotransit/derived
remotion/      Marketing demo video composition
```
