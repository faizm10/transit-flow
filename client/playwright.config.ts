import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? "3000");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    cwd: __dirname,
    port,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      GITHUB_COMMUNITY_DRY_RUN: "1",
      NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN:
        process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "test-token",
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL ?? `http://127.0.0.1:${port}`,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
