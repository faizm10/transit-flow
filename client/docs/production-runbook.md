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
5. For production simulation, publish GO simulation artifacts to Vercel Blob before deploying with `SIMULATION_DATA_MODE=remote`.

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
- Local development should use `SIMULATION_DATA_MODE=raw` unless you are explicitly testing artifact-backed simulation.
- Production should use `SIMULATION_DATA_MODE=remote` with Vercel Blob for GO simulation artifacts.
- Use `SIMULATION_DATA_MODE=precomputed` only if the generated local artifact set is small enough for the deployment target.
- Generate artifacts with:
  ```bash
  python3 scripts/build_simulation_artifacts.py --input_dir client/public/gotransit --output_dir client/public/gotransit/derived/simulation --source gotransit
  ```
- Publish artifacts to Vercel Blob with:
  ```bash
  cd client
  npm run simulation:publish
  ```
- The publish command uploads `manifest.json`, `service-dates/*.json`, and `routes/*.json` under `simulation/gotransit/...` and prints the `SIMULATION_ARTIFACT_BASE_URL` to use in Vercel.
- Required publishing secret: `BLOB_READ_WRITE_TOKEN`.
- The full GO Transit artifact set generated from the current feed is too large for a Vercel app bundle, so treat remote artifact hosting as the expected production path.
- Run a deployment with `VERCEL_ANALYZE_BUILD_OUTPUT=1` to inspect whether simulation data is inflating the function bundle.

## Community Triage
- Configure `GITHUB_COMMUNITY_TOKEN`, `GITHUB_COMMUNITY_REPO`, and `NEXT_PUBLIC_COMMUNITY_URL` before enabling the in-app form.
- Ensure GitHub labels `bug`, `feedback`, and `community-report` exist.
- Review new community-submitted issues daily for duplicates, severity labels, and roadmap follow-up.
- If GitHub issue creation fails, the app returns a user-safe error and the failure is logged under `[api] /api/community/report`.
