import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { gtfsFeeds } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { upsertUser } from "@/lib/upsertUser";
import { randomUUID } from "crypto";

export const maxDuration = 300;

const MAX_ZIP_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to upload GTFS feeds" }, { status: 401 });
  }

  try {
    await upsertUser(session);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const cityName = (formData.get("cityName") as string | null)?.trim();

    if (!file) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }
    if (!cityName) {
      return NextResponse.json({ error: "Missing cityName field" }, { status: 400 });
    }
    if (file.size > MAX_ZIP_BYTES) {
      return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 413 });
    }
    // Loose ZIP check: PK header
    const headerBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (headerBytes[0] !== 0x50 || headerBytes[1] !== 0x4b) {
      return NextResponse.json({ error: "File must be a ZIP archive" }, { status: 400 });
    }

    const feedId = randomUUID();

    // Upload raw ZIP to Blob
    const zipBuffer = await file.arrayBuffer();
    await put(`feeds/${feedId}/raw/feed.zip`, zipBuffer, { access: "public" });

    // Insert DB row
    await db.insert(gtfsFeeds).values({
      id:       feedId,
      userId:   session.user.id,
      cityName,
      status:   "processing",
    });

    // Trigger processing in background after response is sent
    after(async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        await fetch(`${baseUrl}/api/gtfs/process`, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gtfs-secret": process.env.GTFS_PROCESS_SECRET ?? "dev-secret",
          },
          body: JSON.stringify({ feedId }),
        });
      } catch (err) {
        console.error("[gtfs/upload] after() trigger failed:", err);
      }
    });

    return NextResponse.json({ feedId, status: "processing" });
  } catch (err) {
    console.error("[gtfs/upload] error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
