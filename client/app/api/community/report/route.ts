import { NextRequest } from "next/server";
import type { CommunityReportPayload } from "@/lib/community";
import {
  applyRateLimit,
  jsonError,
  jsonOk,
  logApiEvent,
  readJsonBody,
  withTimeout,
} from "@/lib/server/api";
import { prepareCommunityIssue } from "@/lib/server/community-report";

type GitHubIssueResponse = {
  html_url?: string;
  number?: number;
};

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  logApiEvent("/api/community/report", "request");

  const limited = applyRateLimit(request, {
    bucket: "community-report",
    limit: 6,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = await readJsonBody<CommunityReportPayload>(request, {
    maxBytes: 12_000,
  });
  if (!body.ok) return body.response;

  const prepared = prepareCommunityIssue(
    body.data,
    process.env.GITHUB_COMMUNITY_REPO,
  );
  if (!prepared.ok) {
    return jsonError(
      400,
      "Submission validation failed",
      "Please correct the highlighted fields and try again.",
      { fieldErrors: prepared.fieldErrors },
    );
  }

  const [owner, repo] = prepared.issue.repo.split("/");

  if (process.env.GITHUB_COMMUNITY_DRY_RUN === "1") {
    return jsonOk({
      ok: true,
      issueUrl: `https://github.com/${prepared.issue.repo}/issues/99999`,
      issueNumber: 99999,
      dryRun: true,
    });
  }

  if (!process.env.GITHUB_COMMUNITY_TOKEN) {
    return jsonError(
      500,
      "Community reporting is not configured",
      "GitHub reporting is unavailable right now. Please try again later.",
    );
  }

  try {
    const response = await withTimeout(
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_COMMUNITY_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "TransitFlow-Community-Reporter",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: prepared.issue.title,
          body: prepared.issue.body,
          labels: prepared.issue.labels,
        }),
      }),
      10_000,
      "GitHub issue creation",
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      logApiEvent("/api/community/report", "error", {
        durationMs: Date.now() - requestStartedAt,
        status: response.status,
        githubError: payload,
      });
      return jsonError(
        502,
        "Failed to create GitHub issue",
        "Your submission could not be forwarded to GitHub. Please try again later.",
      );
    }

    const issue = (await response.json()) as GitHubIssueResponse;
    if (!issue.html_url || typeof issue.number !== "number") {
      return jsonError(
        502,
        "Failed to create GitHub issue",
        "GitHub returned an unexpected response.",
      );
    }

    logApiEvent("/api/community/report", "success", {
      durationMs: Date.now() - requestStartedAt,
      issueNumber: issue.number,
      type: body.data.type,
    });
    return jsonOk({
      ok: true,
      issueUrl: issue.html_url,
      issueNumber: issue.number,
    });
  } catch (error) {
    logApiEvent("/api/community/report", "error", {
      durationMs: Date.now() - requestStartedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError(
      502,
      "Failed to create GitHub issue",
      "Your submission could not be forwarded to GitHub. Please try again later.",
    );
  }
}
