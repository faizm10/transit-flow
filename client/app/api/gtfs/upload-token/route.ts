import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Sign-in is currently disabled for GTFS uploads — anyone may upload,
// constrained by content type and the 500 MB size cap below.
export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/zip",
          "application/x-zip-compressed",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 500 * 1024 * 1024,
      }),
      // No onUploadCompleted: registering it makes Vercel Blob call back into
      // this deployment before the browser upload resolves — which hangs the
      // upload at ~99% on localhost and on protected preview deployments.
      // Feed registration happens explicitly via /api/gtfs/register instead.
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[upload-token] error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
