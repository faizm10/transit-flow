# TransitFlow

GO Transit network design and simulation in the browser — live GTFS, one map, four modes.

## Tech Stack

**Framework & Language**
- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)

**Mapping**
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) — interactive map
- [Mapbox Static Images API](https://docs.mapbox.com/api/maps/static-images/) — server-side map previews
- [@mapbox/mapbox-gl-draw](https://github.com/mapbox/mapbox-gl-draw) — freehand route drawing

**Styling & UI**
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) — component library
- [Base UI](https://base-ui.com) — headless primitives
- [Lucide React](https://lucide.dev) — icons

**Auth**
- [NextAuth v5 (Auth.js)](https://authjs.dev) — GitHub & Google OAuth, JWT sessions

**Database**
- [Neon Postgres](https://neon.tech) — serverless PostgreSQL
- [Drizzle ORM](https://orm.drizzle.team) — schema, queries, migrations
- [@neondatabase/serverless](https://github.com/neondatabase/serverless) — HTTP driver

**AI**
- [Anthropic Claude API](https://docs.anthropic.com) — route agent & schedule optimiser (`claude-sonnet-4-6`)

**Data**
- [GTFS](https://gtfs.org) — real GO Transit schedule data (pre-computed + live)

**Deployment**
- [Vercel](https://vercel.com) — hosting, preview deployments, environment variables

## Getting Started

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and fill in the required keys:

```
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
MAPBOX_ACCESS_TOKEN=
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
DATABASE_URL=
```
