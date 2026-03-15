import { NextResponse } from "next/server";
import { getGoScheduleBuilderPayload } from "@/lib/goScheduleBuilderData";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variant_id")?.trim();
    if (!variantId) {
      return NextResponse.json({ error: "variant_id is required" }, { status: 400 });
    }

    const payload = await getGoScheduleBuilderPayload(variantId);
    if (!payload) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error loading GO schedule builder payload:", error);
    return NextResponse.json(
      { error: "Failed to load GO schedule builder payload" },
      { status: 500 },
    );
  }
}
