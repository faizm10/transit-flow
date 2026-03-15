import { NextRequest } from "next/server";

export function resolveAppUrl(request: NextRequest) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host");

  if (!host) {
    return "http://localhost:3000";
  }

  return `${proto}://${host}`;
}
