import { NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/requireOwner";
import { getMockSnapshot } from "@/lib/gtfsIngestion/mock";

/**
 * GET /api/admin/gtfs
 *
 * Stub: returns a mock snapshot (active version, current job, history).
 * Replace the body with DB reads once versions/jobs are persisted.
 */
export async function GET() {
  try {
    const gate = await requireOwnerApi();
    if (!gate.ok) return gate.response;
    return NextResponse.json(getMockSnapshot());
  } catch (err) {
    console.error("[admin/gtfs GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
