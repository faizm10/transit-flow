import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method ?? "GET";

  const isWrite = method !== "GET";
  const isCommunityApi = pathname.startsWith("/api/community");

  if (isCommunityApi && isWrite) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ["/api/community/:path*"],
};
