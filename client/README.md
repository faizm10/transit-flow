# TransitFlow Client

Next.js 16 app for TransitFlow's public-beta workspace, GTFS-backed APIs, and AI-assisted planning tools.

## Local development

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and use `/map` for the main workspace.

## Required environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `MAPBOX_ACCESS_TOKEN`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` only if Gemini-backed features remain enabled
- `SENTRY_DSN` optional placeholder for external monitoring
- `BLOB_READ_WRITE_TOKEN` for publishing simulation artifacts to Vercel Blob
- `SIMULATION_DATA_MODE`
- `SIMULATION_ARTIFACT_BASE_URL` if remote simulation artifacts are used

See [`.env.example`](/Applications/vscode/transit-flow/client/.env.example).

## Production readiness additions

- Security headers and CSP in [proxy.ts](/Applications/vscode/transit-flow/client/proxy.ts)
- API rate limits, request validation, and timeout handling in [lib/server/api.ts](/Applications/vscode/transit-flow/client/lib/server/api.ts)
- GTFS file caching in [gtfs-cache.ts](/Applications/vscode/transit-flow/client/lib/server/gtfs-cache.ts)
- Vercel config in [vercel.json](/Applications/vscode/transit-flow/client/vercel.json)
- CI in [client-ci.yml](/Applications/vscode/transit-flow/.github/workflows/client-ci.yml)
- Launch runbook in [production-runbook.md](/Applications/vscode/transit-flow/client/docs/production-runbook.md)

## Checks

```bash
npm run lint
npm run build
npm run test:e2e
```

## Simulation artifacts

Generate route-scoped simulation artifacts for production-oriented deployments:

```bash
python3 /Applications/vscode/transit-flow/scripts/build_simulation_artifacts.py --input_dir /Applications/vscode/transit-flow/client/public/gotransit --output_dir /Applications/vscode/transit-flow/client/public/gotransit/derived/simulation --source gotransit
```

Publish GO simulation artifacts to Vercel Blob for production:

```bash
cd /Applications/vscode/transit-flow/client
npm run simulation:publish
```

Useful flags:

```bash
npm run simulation:publish -- --dry-run --skip-build
```

For the current GO Transit feed, the generated artifact set is too large to package into a Vercel app bundle. Production should use `SIMULATION_DATA_MODE=remote` with `SIMULATION_ARTIFACT_BASE_URL` set to the Blob base URL printed by the publish command.
