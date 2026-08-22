import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/requireOwner";
import { createMockQueuedJob, logStubIngest } from "@/lib/gtfsIngestion/mock";

/**
 * POST /api/admin/gtfs/ingest
 *
 * Stub: does NOT accept or store a GTFS zip. JSON metadata only.
 * Later this creates a job, stores the zip (object storage), and enqueues a worker.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireOwnerApi();
    if (!gate.ok) return gate.response;

    const body = (await req.json()) as { filename?: string; byteSize?: number };
    const filename = body.filename?.trim() ?? "";
    const byteSize = body.byteSize;

    if (!filename.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "filename must be a .zip" }, { status: 400 });
    }
    if (typeof byteSize !== "number" || byteSize <= 0 || !Number.isFinite(byteSize)) {
      return NextResponse.json({ error: "byteSize must be a positive number" }, { status: 400 });
    }

    logStubIngest(filename, byteSize);
    return NextResponse.json({ job: createMockQueuedJob(filename) }, { status: 202 });
  } catch (err) {
    console.error("[admin/gtfs/ingest POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
