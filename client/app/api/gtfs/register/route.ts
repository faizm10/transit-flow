import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { upsertUser } from "@/lib/upsertUser";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { gtfsProcessSecret } from "@/lib/gtfsProcessSecret";
import { randomUUID } from "crypto";

export const maxDuration = 60;

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
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      await fetch(`${baseUrl}/api/gtfs/process`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gtfs-secret": processSecret,
        },
        body: JSON.stringify({ feedId, blobUrl }),
      });
    } catch (err) {
      console.error("[gtfs/register] after() trigger failed:", err);
    }
  });

  return NextResponse.json({ feedId, status: "processing" });
}
