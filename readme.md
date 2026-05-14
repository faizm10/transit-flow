# TransitFlow

TransitFlow is a transit planning workspace for designing routes, comparing service, generating schedules, and simulating GTFS-backed operations.

## App layout

- `client/`: production Next.js app, API routes, static GTFS assets
- `server/`: data prep and source GTFS files
- `scripts/`: preprocessing helpers such as GTFS subroute generation

## Local setup

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/map`.

## Production target

The repo is set up for a Vercel-first public beta:

- Vercel app root is `client/`
- CI lives in [client-ci.yml](/Applications/vscode/transit-flow/.github/workflows/client-ci.yml)
- Runtime hardening utilities live in [api.ts](/Applications/vscode/transit-flow/client/lib/server/api.ts)
- Launch procedures live in [production-runbook.md](/Applications/vscode/transit-flow/client/docs/production-runbook.md)

## GTFS preprocessing

```bash
python3 scripts/build_subroutes.py --input_dir <path-to-gtfs> --output_dir <path-to-output>
```

Example (raw GTFS lives under `server/data/gotransit`; derived JSON/GeoJSON under `client/public/gotransit/derived`):

```bash
python3 scripts/build_subroutes.py --input_dir server/data/gotransit --output_dir client/public/gotransit/derived
python3 scripts/build_gtfs_derived.py
```

Simulation artifacts for production-style deployments:

```bash
python3 scripts/build_simulation_artifacts.py --input_dir server/data/gotransit --output_dir client/public/gotransit/derived/simulation --source gotransit
```

Publish GO simulation artifacts to Vercel Blob:

```bash
cd client
npm run simulation:publish
```

The publish command prints the `SIMULATION_ARTIFACT_BASE_URL` value to use with `SIMULATION_DATA_MODE=remote`.
