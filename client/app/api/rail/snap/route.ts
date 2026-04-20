import { NextRequest, NextResponse } from "next/server";
import { snapRailPoint } from "@/lib/server/rail-routing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const maxDistanceM = Number(req.nextUrl.searchParams.get("maxDistanceM") ?? "1200");

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "lon and lat query params are required." }, { status: 400 });
  }

  try {
    const snap = snapRailPoint([lon, lat], Number.isFinite(maxDistanceM) ? maxDistanceM : 1200);
    return NextResponse.json({ snap });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to snap to rail network." },
      { status: 500 }
    );
  }
}
