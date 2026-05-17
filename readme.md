# TransitFlow

Browser-based workspace for exploring GO Transit, sketching routes, comparing schedules, and running simulations on live GTFS data.

## Repository layout

| Path | Purpose |
|------|---------|
| `client/` | Next.js app (UI, API routes, static GTFS assets) — **start here** |
| `server/data/` | Source GTFS feeds |
| `scripts/` | Python pipelines to build derived JSON/GeoJSON |

## Quick start

```bash
cd client
npm install
npm run dev
```

Add `client/.env.local` before using the map (see [client/README.md](client/README.md)).

Open [http://localhost:3000/map](http://localhost:3000/map).

Details, environment variables, and npm scripts: **[client/README.md](client/README.md)**.

## Deploy

- **Host:** [Vercel](https://vercel.com) with project root set to `client/`
- **CI:** [.github/workflows/client-ci.yml](.github/workflows/client-ci.yml)

## GTFS data pipeline

Raw feeds live under `server/data/gotransit`. Derived assets are written to `client/public/gotransit/derived`.

```bash
# Subroutes + derived tables (from repo root)
python3 scripts/build_subroutes.py \
  --input_dir server/data/gotransit \
  --output_dir client/public/gotransit/derived

python3 scripts/build_gtfs_derived.py

# Simulation artifacts (optional)
python3 scripts/build_simulation_artifacts.py \
  --input_dir server/data/gotransit \
  --output_dir client/public/gotransit/derived/simulation \
  --source gotransit
```

Or from `client/`: `npm run gtfs:derive` runs `build_gtfs_derived.py`.
