#!/usr/bin/env node
// Updates the <!-- GA_STATS_START/END --> block in README.md with live GA4 data.
// Runs via GitHub Actions (hourly cron). Requires:
//   GA4_PROPERTY_ID          — numeric GA4 property ID (e.g. "538271791")
//   GOOGLE_SERVICE_ACCOUNT_JSON — full service-account JSON as a string

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const fs = require("fs");
const path = require("path");

const propertyId = process.env.GA4_PROPERTY_ID;
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!propertyId || !serviceAccountJson) {
  console.error(
    "❌  Missing required env vars: GA4_PROPERTY_ID, GOOGLE_SERVICE_ACCOUNT_JSON"
  );
  process.exit(1);
}

let credentials;
try {
  credentials = JSON.parse(serviceAccountJson);
} catch {
  console.error("❌  GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  process.exit(1);
}

const client = new BetaAnalyticsDataClient({ credentials });

function fmt(n) {
  return parseInt(n ?? "0", 10).toLocaleString("en-US");
}

async function main() {
  console.log(`Fetching GA4 stats for property ${propertyId}…`);

  const [[r365d], [r30d], [r7d]] = await Promise.all([
    client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "sessions" },
      ],
    }),
    client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "sessions" },
      ],
    }),
    client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
    }),
  ]);

  const mv365 = r365d.rows?.[0]?.metricValues ?? [];
  const mv30 = r30d.rows?.[0]?.metricValues ?? [];
  const mv7 = r7d.rows?.[0]?.metricValues ?? [];

  const activeUsers365d = fmt(mv365[0]?.value);
  const pageViews365d = fmt(mv365[1]?.value);
  const sessions365d = fmt(mv365[2]?.value);
  const activeUsers30d = fmt(mv30[0]?.value);
  const pageViews30d = fmt(mv30[1]?.value);
  const sessions30d = fmt(mv30[2]?.value);
  const activeUsers7d = fmt(mv7[0]?.value);
  const pageViews7d = fmt(mv7[1]?.value);

  const updatedAt = new Date().toUTCString();

  const block = `<!-- GA_STATS_START -->
## 📊 Live stats

| Metric | Last 7 days | Last 30 days | Last year |
|--------|:-----------:|:------------:|:---------:|
| Active users | **${activeUsers7d}** | **${activeUsers30d}** | **${activeUsers365d}** |
| Page views | **${pageViews7d}** | **${pageViews30d}** | **${pageViews365d}** |
| Sessions | — | **${sessions30d}** | **${sessions365d}** |

<sub>🤖 Auto-updated every hour &nbsp;·&nbsp; ${updatedAt}</sub>
<!-- GA_STATS_END -->`;

  const readmePath = path.join(__dirname, "..", "readme.md");
  let readme = fs.readFileSync(readmePath, "utf8");

  if (
    readme.includes("<!-- GA_STATS_START -->") &&
    readme.includes("<!-- GA_STATS_END -->")
  ) {
    readme = readme.replace(
      /<!-- GA_STATS_START -->[\s\S]*?<!-- GA_STATS_END -->/,
      block
    );
    console.log("✅  Replaced existing stats block");
  } else {
    // Insert between the two --- separators near the top of the README
    readme = readme.replace(/^---\n\n---\n/m, `---\n\n${block}\n\n---\n`);
    console.log("✅  Inserted new stats block");
  }

  fs.writeFileSync(readmePath, readme, "utf8");
  console.log("README.md written.");
}

main().catch((err) => {
  console.error("❌ ", err.message ?? err);
  process.exit(1);
});
