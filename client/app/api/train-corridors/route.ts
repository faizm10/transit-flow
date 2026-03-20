import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/server/api";
import { getTrainCorridor, getTrainCorridors } from "@/lib/server/trainCorridorData";

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, {
    bucket: "train-corridors",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const corridorId = request.nextUrl.searchParams.get("corridor_id")?.trim();
    if (corridorId) {
      const corridor = await getTrainCorridor(corridorId);
      if (!corridor) {
        return NextResponse.json({ error: "Train corridor not found" }, { status: 404 });
      }
      return NextResponse.json(corridor, {
        headers: {
          "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
        },
      });
    }

    const corridors = await getTrainCorridors();
    return NextResponse.json(
      { corridors },
      {
        headers: {
          "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("Error loading train corridors:", error);
    return NextResponse.json({ error: "Failed to load train corridors" }, { status: 500 });
  }
}
