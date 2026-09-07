import { NextRequest, NextResponse } from "next/server";
import { getStopDepartures, getNextService } from "@/lib/metrolinx";

/**
 * GET /api/metrolinx/departures?stop=<stopCode>&mode=departures|next
 *
 * Proxies the Metrolinx Open Data API for stop departure data.
 * Keeps the API key server-side; returns clean JSON to the client.
 */
export async function GET(request: NextRequest) {
  const stopCode = request.nextUrl.searchParams.get("stop")?.trim();
  const mode = request.nextUrl.searchParams.get("mode") ?? "departures";

  if (!stopCode) {
    return NextResponse.json(
      { error: "stop query param required (e.g. ?stop=UN)" },
      { status: 400 }
    );
  }

  if (!process.env.METROLINX_API_KEY) {
    return NextResponse.json(
      { error: "Metrolinx API key not configured" },
      { status: 503 }
    );
  }

  try {
    const data =
      mode === "next"
        ? await getNextService(stopCode)
        : await getStopDepartures(stopCode);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[metrolinx/departures]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
