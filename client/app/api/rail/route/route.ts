import { NextRequest, NextResponse } from "next/server";
import { routeRailPoints, type LngLat } from "@/lib/server/rail-routing";

export const runtime = "nodejs";

interface RouteBody {
  points?: LngLat[];
  maxSnapDistanceM?: number;
  dwellStopCount?: number;
  dwellSec?: number;
  terminalBufferSec?: number;
}

function isLngLat(value: unknown): value is LngLat {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

export async function POST(req: NextRequest) {
  let body: RouteBody;
  try {
    body = await req.json() as RouteBody;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const points = (body.points ?? []).filter(isLngLat).map((point) => [Number(point[0]), Number(point[1])] as LngLat);
  if (points.length < 2) {
    return NextResponse.json({ error: "At least two route points are required." }, { status: 400 });
  }

  try {
    const result = routeRailPoints(points, {
      maxSnapDistanceM: body.maxSnapDistanceM,
      dwellStopCount: body.dwellStopCount,
      dwellSec: body.dwellSec,
      terminalBufferSec: body.terminalBufferSec,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "No rail route found.",
        fallback: "manual_geometry",
      },
      { status: 422 }
    );
  }
}
