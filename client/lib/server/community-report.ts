import { DEFAULT_COMMUNITY_REPO, type CommunityReportPayload } from "@/lib/community";

type CommunityFieldErrors = Record<string, string>;

type PreparedCommunityIssue = {
  repo: string;
  title: string;
  body: string;
  labels: string[];
};

type ValidationResult =
  | { ok: true; issue: PreparedCommunityIssue }
  | { ok: false; fieldErrors: CommunityFieldErrors };

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function containsHtmlLikeMarkup(value: string) {
  return /<[^>\n]+>/.test(value);
}

function urlCount(value: string) {
  return (value.match(/https?:\/\/\S+/g) ?? []).length;
}

function formatMetadata(metadata: CommunityReportPayload["metadata"]) {
  if (!metadata) return ["- Page: unknown"];

  const lines = [
    `- Page: ${metadata.pagePath || "unknown"}`,
    `- Source: ${metadata.source || "unknown"}`,
    `- Client report ID: ${metadata.clientReportId || "unknown"}`,
  ];

  if (metadata.appVersion) {
    lines.push(`- App version: ${metadata.appVersion}`);
  }
  if (metadata.userAgent) {
    lines.push(`- Browser: ${metadata.userAgent}`);
  }
  if (metadata.viewport) {
    lines.push(`- Viewport: ${metadata.viewport.width}x${metadata.viewport.height}`);
  }
  if (metadata.mapContext && Object.keys(metadata.mapContext).length > 0) {
    lines.push(`- Map context: \`${JSON.stringify(metadata.mapContext)}\``);
  }

  return lines;
}

export function prepareCommunityIssue(
  payload: CommunityReportPayload,
  repoInput?: string | null,
): ValidationResult {
  const fieldErrors: CommunityFieldErrors = {};
  const repo = (repoInput?.trim() || DEFAULT_COMMUNITY_REPO).replace(/^\/+|\/+$/g, "");

  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    fieldErrors.repo = "Community repository is misconfigured.";
  }

  const title = sanitizeText(payload.title, 120);
  const description = sanitizeText(payload.description, 4000);
  const stepsToReproduce = sanitizeText(payload.stepsToReproduce, 2500);
  const expectedBehavior = sanitizeText(payload.expectedBehavior, 1500);
  const actualBehavior = sanitizeText(payload.actualBehavior, 1500);
  const useCase = sanitizeText(payload.useCase, 2000);
  const impact = sanitizeText(payload.impact, 1200);

  if (payload.type !== "bug" && payload.type !== "feedback") {
    fieldErrors.type = "Report type must be bug or feedback.";
  }
  if (!title) {
    fieldErrors.title = "Title is required.";
  }
  if (!description) {
    fieldErrors.description = "Description is required.";
  }
  if (payload.type === "bug") {
    if (!stepsToReproduce) fieldErrors.stepsToReproduce = "Steps to reproduce are required.";
    if (!expectedBehavior) fieldErrors.expectedBehavior = "Expected behavior is required.";
    if (!actualBehavior) fieldErrors.actualBehavior = "Actual behavior is required.";
  }

  const textFields = [
    title,
    description,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    useCase,
    impact,
  ].filter((value): value is string => Boolean(value));

  for (const value of textFields) {
    if (containsHtmlLikeMarkup(value)) {
      fieldErrors.format = "HTML or rich text is not supported.";
      break;
    }
  }

  const urlTotal = textFields.reduce((sum, value) => sum + urlCount(value), 0);
  if (urlTotal > 4) {
    fieldErrors.spam = "Too many links were included in the submission.";
  }

  if (Object.keys(fieldErrors).length > 0 || !title || !description) {
    return { ok: false, fieldErrors };
  }

  const labels =
    payload.type === "bug"
      ? ["bug", "community-report"]
      : ["feedback", "community-report"];

  const bodyLines = [
    `## Submission type`,
    `${payload.type === "bug" ? "Bug report" : "Product feedback"}`,
    ``,
    `## Summary`,
    description,
    ``,
  ];

  if (payload.type === "bug") {
    bodyLines.push(
      "## Steps to reproduce",
      stepsToReproduce || "Not provided",
      "",
      "## Expected behavior",
      expectedBehavior || "Not provided",
      "",
      "## Actual behavior",
      actualBehavior || "Not provided",
      "",
    );
  } else {
    bodyLines.push(
      "## Use case",
      useCase || "Not provided",
      "",
      "## Impact",
      impact || "Not provided",
      "",
    );
  }

  bodyLines.push(
    "## Captured context",
    ...formatMetadata(payload.metadata),
  );

  return {
    ok: true,
    issue: {
      repo,
      title: `[${payload.type === "bug" ? "Bug" : "Feedback"}] ${title}`,
      body: bodyLines.join("\n"),
      labels,
    },
  };
}
