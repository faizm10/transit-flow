import { NextResponse } from "next/server";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.tiles.mapbox.com https://api.mapbox.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' ws: wss: https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://api.anthropic.com https://generativelanguage.googleapis.com",
  "worker-src 'self' blob:",
].join("; ");

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return response;
}


export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
