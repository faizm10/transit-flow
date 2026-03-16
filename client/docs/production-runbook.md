# TransitFlow Production Runbook

## Environments
- `local`: `.env.local` from `.env.example`
- `preview`: Vercel preview deployment with non-production API keys and budgets
- `production`: `NEXT_PUBLIC_SITE_URL` set to the live domain and server-only AI keys rotated separately

## Deploy
1. Set the Vercel project root to `client/`.
2. Configure preview and production environment variables from [`.env.example`](/Applications/vscode/transit-flow/client/.env.example).
3. Require [`.github/workflows/client-ci.yml`](/Applications/vscode/transit-flow/.github/workflows/client-ci.yml) to pass before production promotion.
4. Promote the latest green Vercel deployment.
5. For production simulation, generate or publish simulation artifacts before switching `SIMULATION_DATA_MODE` away from `raw`.

## Rollback
1. Revert or redeploy the last healthy Vercel build.
2. Confirm `/`, `/map`, `/api/union-pearson`, and `/api/gotransit/frequency` respond.
3. If AI failures spike, disable AI features by removing `ANTHROPIC_API_KEY` until provider health is restored.

## Monitoring
- Watch server logs for `[api]` and `[telemetry]` events.
- Alert on sustained increases in `429`, `5xx`, or AI timeout errors.
- Track `/api/simulation` specifically for `SIMULATION_DATA_UNAVAILABLE`, artifact source mode, and degraded custom-route-only fallbacks.
- Beta targets:
  - initial page load under 4s on preview data
  - API p95 under 3s for cached endpoints
  - AI request p95 under 12s
  - error rate under 2%

## Secret Rotation
- Treat any previously committed `.env.local` values as compromised.
- Rotate `ANTHROPIC_API_KEY` and any privileged Mapbox token first.
- Keep `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` restricted to expected client origins.

## Provider Outage Handling
- `route-agent` degrades to deterministic routing when Mapbox directions fail.
- `schedule-optimizer` returns a deterministic fallback schedule when Anthropic is unavailable or rate-limited.
- If provider costs or latency exceed budget, remove the AI key from preview first, then production.

## Simulation Data
- Default `SIMULATION_DATA_MODE=raw` keeps local development simple and uses the hardened raw GTFS parser.
- Preferred production mode is `SIMULATION_DATA_MODE=precomputed` once route-scoped simulation artifacts have been generated.
- Use `SIMULATION_DATA_MODE=remote` with `SIMULATION_ARTIFACT_BASE_URL` only if local artifacts pressure Vercel bundle size.
- Generate artifacts with:
  ```bash
  python3 scripts/build_simulation_artifacts.py --input_dir client/public/gotransit --output_dir client/public/gotransit/derived/simulation --source gotransit
  ```
- Run a deployment with `VERCEL_ANALYZE_BUILD_OUTPUT=1` to inspect whether simulation data is inflating the function bundle.

## Community Triage
- Configure `GITHUB_COMMUNITY_TOKEN`, `GITHUB_COMMUNITY_REPO`, and `NEXT_PUBLIC_COMMUNITY_URL` before enabling the in-app form.
- Ensure GitHub labels `bug`, `feedback`, and `community-report` exist.
- Review new community-submitted issues daily for duplicates, severity labels, and roadmap follow-up.
- If GitHub issue creation fails, the app returns a user-safe error and the failure is logged under `[api] /api/community/report`.
