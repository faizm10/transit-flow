export type CommunityReportType = "bug" | "feedback";

export type CommunityReportMetadata = {
  pagePath?: string;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  appVersion?: string;
  source?: string;
  clientReportId?: string;
  mapContext?: Record<string, unknown>;
};

export type CommunityReportPayload = {
  type: CommunityReportType;
  title: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  useCase?: string;
  impact?: string;
  metadata?: CommunityReportMetadata;
};

export const DEFAULT_COMMUNITY_REPO = "faizm10/transit-flow";

export function getCommunityIssuesUrl() {
  return (
    process.env.NEXT_PUBLIC_COMMUNITY_URL?.trim() ||
    `https://github.com/${DEFAULT_COMMUNITY_REPO}/issues`
  );
}
