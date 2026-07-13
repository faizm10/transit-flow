import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { upsertUser } from "@/lib/upsertUser";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { gtfsProcessSecret } from "@/lib/gtfsProcessSecret";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Must cover the awaited /api/gtfs/process call in after() below (also 300s) —
// if this function is killed early, the in-flight processing request can be
// cancelled with it, leaving the feed stuck in "processing".
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Fail loudly before accepting the feed if processing can't be triggered —
  // otherwise the feed would sit in "processing" forever.
  const processSecret = gtfsProcessSecret();
  if (!processSecret) {
    console.error("[gtfs/register] GTFS_PROCESS_SECRET is not configured");
    return NextResponse.json(
      { error: "Uploads are temporarily unavailable (server misconfiguration)" },
      { status: 503 },
    );
  }

  // Sign-in is currently optional — anonymous feeds are stored with a null
  // userId and tracked client-side in localStorage (see lib/localFeeds.ts).
  let userId: string | null = null;
  try {
    const session = await auth();
    if (session?.user?.id) {
      await upsertUser(session);
      userId = session.user.id;
    }
  } catch { /* treat as anonymous */ }

  const { blobUrl, cityName } = (await req.json()) as {
    blobUrl?: string;
    cityName?: string;
  };

  if (!blobUrl || !cityName?.trim()) {
    return NextResponse.json({ error: "Missing blobUrl or cityName" }, { status: 400 });
  }

  const feedId = randomUUID();

  await db.insert(gtfsFeeds).values({
    id:       feedId,
    userId,
    cityName: cityName.trim(),
    status:   "processing",
  });

  after(async () => {
    try {
      // Prefer the current deployment's own URL (VERCEL_URL) so preview
      // deployments trigger their own /api/gtfs/process rather than another
      // environment's (production may not even have this route yet).
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/gtfs/process`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gtfs-secret": processSecret,
          // Lets the self-call through Vercel deployment protection on
          // previews, when the bypass secret is configured.
          ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
            : {}),
        },
        body: JSON.stringify({ feedId, blobUrl }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`process trigger returned ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      console.error("[gtfs/register] after() trigger failed:", err);
      // Don't leave the feed spinning in "processing" — mark it failed so the
      // UI shows a real error instead of an endless spinner.
      await db
        .update(gtfsFeeds)
        .set({ status: "failed", errorMessage: "Could not start processing. Please try again." })
        .where(eq(gtfsFeeds.id, feedId))
        .catch(() => {});
    }
  });

  return NextResponse.json({ feedId, status: "processing" });
}
