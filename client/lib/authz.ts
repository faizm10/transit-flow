/**
 * Authorization — the single place that decides who is privileged.
 *
 * Until there is a role column on `community_users`, "owner" is identity-based:
 * a GitHub login or an email address on an allowlist. The allowlist is
 * configurable so a deployment does not need a code change to move it, and
 * falls back to the historical hardcoded values so existing deployments keep
 * working without new environment variables.
 *
 * Every privileged surface — pages and API routes alike — goes through
 * `isOwner`, `requireOwnerPage`, or `requireOwnerApi`. Do not re-derive the
 * check inline.
 */

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

const DEFAULT_OWNER_GITHUB_LOGINS = ["faizm10"];
const DEFAULT_OWNER_EMAILS = ["faizmustansar10@gmail.com"];

function parseList(raw: string | undefined, fallback: string[]): string[] {
  const parsed =
    raw
      ?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean) ?? [];
  return parsed.length > 0 ? parsed : fallback;
}

const OWNER_GITHUB_LOGINS = parseList(
  process.env.OWNER_GITHUB_LOGINS,
  DEFAULT_OWNER_GITHUB_LOGINS
);
const OWNER_EMAILS = parseList(process.env.OWNER_EMAILS, DEFAULT_OWNER_EMAILS);

/** GitHub handle carried through the JWT by the `jwt` callback in lib/auth.ts. */
function sessionLogin(session: Session | null): string | undefined {
  return (session?.user as { login?: string } | undefined)?.login?.toLowerCase();
}

export function isOwner(session: Session | null): boolean {
  if (!session?.user) return false;
  const login = sessionLogin(session);
  const email = session.user.email?.toLowerCase();
  return (
    (!!login && OWNER_GITHUB_LOGINS.includes(login)) ||
    (!!email && OWNER_EMAILS.includes(email))
  );
}

/**
 * Page guard. 404s rather than 403s so a privileged surface is not discoverable
 * by an unauthorized visitor. Returns the session for the caller to reuse.
 */
export async function requireOwnerPage(): Promise<Session> {
  const session = await auth();
  if (!isOwner(session)) notFound();
  return session as Session;
}

/**
 * Route-handler guard. Returns a 404 `NextResponse` when the caller is not the
 * owner, or `null` when they are:
 *
 *   const denied = await requireOwnerApi();
 *   if (denied) return denied;
 */
export async function requireOwnerApi(): Promise<NextResponse | null> {
  const session = await auth();
  if (!isOwner(session)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}
