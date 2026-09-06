import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db, datasets, datasetMetrics } from "@/lib/db";
import {
  handle,
  requireSession,
  requireSyncedUser,
  ApiError,
} from "@/lib/datasets/server/access";

/** Guardrail so one account cannot fill the database with empty drafts. */
const MAX_DATASETS_PER_USER = 25;

// ── GET /api/datasets — the caller's datasets, newest first ─────────────────
export async function GET() {
  return handle(async () => {
    const session = await requireSession();

    const rows = await db
      .select({
        id: datasets.id,
        name: datasets.name,
        description: datasets.description,
        status: datasets.status,
        feedInfo: datasets.feedInfo,
        createdAt: datasets.createdAt,
        updatedAt: datasets.updatedAt,
        readyAt: datasets.readyAt,
        metrics: datasetMetrics.metrics,
      })
      .from(datasets)
      // Left join: a draft or importing dataset has no metrics row yet.
      .leftJoin(datasetMetrics, eq(datasetMetrics.datasetId, datasets.id))
      .where(eq(datasets.ownerId, session.user.id))
      .orderBy(desc(datasets.createdAt));

    return NextResponse.json({ datasets: rows });
  });
}

// ── POST /api/datasets — create a draft ─────────────────────────────────────
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSyncedUser();

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      description?: unknown;
    };

    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (name.length === 0) {
      throw new ApiError(400, "invalid_name", "Give the dataset a name");
    }

    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 500) || null
        : null;

    const existing = await db
      .select({ id: datasets.id })
      .from(datasets)
      .where(eq(datasets.ownerId, session.user.id))
      .limit(MAX_DATASETS_PER_USER);

    if (existing.length >= MAX_DATASETS_PER_USER) {
      throw new ApiError(
        409,
        "dataset_limit_reached",
        `You have reached the limit of ${MAX_DATASETS_PER_USER} datasets. Delete one to create another.`
      );
    }

    const [dataset] = await db
      .insert(datasets)
      .values({ ownerId: session.user.id, name, description, status: "draft" })
      .returning();

    return NextResponse.json({ dataset }, { status: 201 });
  });
}
