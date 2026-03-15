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

Example:

```bash
python3 scripts/build_subroutes.py --input_dir client/public/gotransit --output_dir client/public/gotransit/derived
```
