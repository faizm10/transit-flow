import { NextResponse } from "next/server";
import { getServiceAlerts } from "@/lib/metrolinx";

/**
 * GET /api/metrolinx/alerts
 *
 * Returns raw service alerts from the Metrolinx Open Data API.
 * Cached for 5 minutes. Use /api/service-updates for the normalized
 * version with line filtering and type classification.
 */
export async function GET() {
  if (!process.env.METROLINX_API_KEY) {
    return NextResponse.json(
      { error: "Metrolinx API key not configured" },
      { status: 503 }
    );
  }

  try {
    const data = await getServiceAlerts();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[metrolinx/alerts]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
