# GTFS ingestion worker.
#
# One process, no web server, no framework. It polls Postgres for jobs and
# exits cleanly on SIGTERM, which is all any container platform needs —
# Railway, Render, Fly, Cloud Run and ECS all run this unchanged.
FROM node:24-slim AS base
WORKDIR /app

# Dependencies first, so a source change does not reinstall them.
COPY worker/package.json worker/package-lock.json ./worker/
RUN cd worker && npm ci --omit=dev

# The worker imports a few modules from the Next.js app — the GTFS spec, the
# zip layout rules, and the stage machine. Sharing them is deliberate: the
# browser's preflight verdict and the worker's must not drift apart.
COPY client/lib/gtfs/spec.ts        ./client/lib/gtfs/spec.ts
COPY client/lib/gtfs/zipLayout.ts   ./client/lib/gtfs/zipLayout.ts
COPY client/lib/datasets/stages.ts  ./client/lib/datasets/stages.ts

COPY worker/src ./worker/src
COPY worker/tsconfig.json ./worker/

# Node ESM resolves a package from the *importing* file's directory, so the
# shared client/ modules need node_modules reachable from their own path.
RUN ln -s /app/worker/node_modules /app/client/node_modules

ENV NODE_ENV=production
WORKDIR /app/worker

# tsx strips types at runtime. No build step, and the container runs exactly
# the source that is in the repository.
CMD ["npx", "tsx", "src/index.ts"]
