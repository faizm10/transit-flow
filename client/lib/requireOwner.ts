import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwnerSession } from "@/lib/owner";

/** Auth for owner-only API routes. 401 if signed out, 404 if not the owner. */
export async function requireOwnerApi() {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isOwnerSession(session)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  return { ok: true as const, session };
}
