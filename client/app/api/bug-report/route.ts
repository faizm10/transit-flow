import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = "faizm10/transit-flow";
const GITHUB_API  = "https://api.github.com";

export async function POST(req: NextRequest) {
  try {
    const token = process.env.GITHUB_BUG_REPORT_TOKEN;
    if (!token) {
      console.error("[bug-report] GITHUB_BUG_REPORT_TOKEN is not set");
      return NextResponse.json({ error: "Bug reporting is not configured" }, { status: 503 });
    }

    const body = await req.json() as {
      title?: string;
      description?: string;
      page?: string;
    };

    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    const page = (body.page ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: "Title is too long" }, { status: 400 });
    }
    if (description.length > 5000) {
      return NextResponse.json({ error: "Description is too long" }, { status: 400 });
    }

    // Build the issue body
    const issueBody = [
      description ? `## What happened\n\n${description}` : "## What happened\n\n_Not provided_",
      page ? `## Where\n\n\`${page}\`` : null,
      `## Reported via\n\nTransitFlow in-app bug report form`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const ghRes = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `[Bug] ${title}`,
        body: issueBody,
        labels: ["bug", "community-report"],
      }),
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error("[bug-report] GitHub API error:", ghRes.status, err);
      return NextResponse.json({ error: "Failed to create issue" }, { status: 502 });
    }

    const issue = await ghRes.json() as { html_url: string; number: number };
    return NextResponse.json({ ok: true, issueUrl: issue.html_url, issueNumber: issue.number });
  } catch (err) {
    console.error("[bug-report]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
