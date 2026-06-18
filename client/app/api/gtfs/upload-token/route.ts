import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { upsertUser } from "@/lib/upsertUser";

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const session = await auth();
        if (!session?.user) throw new Error("Sign in to upload GTFS feeds");
        await upsertUser(session);
        return {
          allowedContentTypes: [
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024,
          tokenPayload: session.user.id,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("[upload-token] upload completed:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
