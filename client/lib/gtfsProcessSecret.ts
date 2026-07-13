/**
 * Shared secret guarding the internal /api/gtfs/process endpoint.
 *
 * In production the env var is REQUIRED — returning null here makes callers
 * fail loudly instead of falling back to a string that is visible in the
 * public repository (which would leave the endpoint unprotected).
 */
export function gtfsProcessSecret(): string | null {
  const secret = process.env.GTFS_PROCESS_SECRET;
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? null : "dev-secret";
}
