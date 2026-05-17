import { NextResponse } from "next/server";
import { fetchServiceUpdates } from "@/lib/serviceUpdates";

export async function GET() {
  const result = await fetchServiceUpdates();
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
