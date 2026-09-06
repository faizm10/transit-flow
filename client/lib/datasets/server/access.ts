import "server-only";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { db, datasets, type Dataset } from "@/lib/db";
import { upsertUser } from "@/lib/upsertUser";

/**
 * Dataset access control.
 *
 * Every dataset route resolves ownership through here. Datasets are private to
 * their owner: a dataset can hold a paid-for feed, and its stop-level data is
 * the user's to share or not.
 *
 * A caller who is not the owner gets 404, not 403 — a 403 confirms the id
 * exists, which is an enumeration oracle we have no reason to hand out.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      { error: { code: this.code, message: this.message, ...this.detail } },
      { status: this.status }
    );
  }
}

export const notFound = () =>
  new ApiError(404, "not_found", "Dataset not found");

export const unauthorized = () =>
  new ApiError(401, "unauthorized", "Sign in to continue");

/**
 * Wrap a route handler so thrown ApiErrors become responses and anything else
 * becomes a 500 without leaking internals to the client.
 */
export async function handle(
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "api",
        level: "error",
        msg: "unhandled_route_error",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    );
    return NextResponse.json(
      { error: { code: "internal_error", message: "Something went wrong" } },
      { status: 500 }
    );
  }
}

/** The signed-in session, or a thrown 401. */
export async function requireSession(): Promise<Session & { user: { id: string } }> {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();
  return session as Session & { user: { id: string } };
}

/**
 * Session plus a `community_users` row, for handlers that are about to write
 * something with an owner FK.
 */
export async function requireSyncedUser(): Promise<
  Session & { user: { id: string } }
> {
  const session = await requireSession();
  await upsertUser(session);
  return session;
}

/** The dataset, if the caller owns it. Throws 404 otherwise. */
export async function requireOwnedDataset(datasetId: string): Promise<{
  dataset: Dataset;
  userId: string;
}> {
  const session = await requireSession();

  // A malformed id would make Postgres raise on the uuid cast; treat it as a
  // miss so a bad URL is a 404 rather than a 500.
  if (!isUuid(datasetId)) throw notFound();

  const [dataset] = await db
    .select()
    .from(datasets)
    .where(
      and(eq(datasets.id, datasetId), eq(datasets.ownerId, session.user.id))
    )
    .limit(1);

  if (!dataset) throw notFound();
  return { dataset, userId: session.user.id };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
