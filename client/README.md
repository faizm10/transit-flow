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
