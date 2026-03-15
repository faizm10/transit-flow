import { expect, test } from "@playwright/test";

test("landing page and map shell load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Plan transit on one board." })).toBeVisible();

  await page.goto("/map");
  await expect(page.getByRole("button", { name: "Networks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Builder" })).toBeVisible();
});

test("core transit APIs return data", async ({ request }) => {
  const [upx, coverage, frequency] = await Promise.all([
    request.get("/api/union-pearson"),
    request.get("/api/gotransit/coverage"),
    request.get("/api/gotransit/frequency"),
  ]);

  expect(upx.ok()).toBeTruthy();
  expect(coverage.ok()).toBeTruthy();
  expect(frequency.ok()).toBeTruthy();

  const upxData = await upx.json();
  const coverageData = await coverage.json();
  const frequencyData = await frequency.json();

  expect(Array.isArray(upxData.features)).toBeTruthy();
  expect(Array.isArray(coverageData.features)).toBeTruthy();
  expect(Array.isArray(frequencyData.results)).toBeTruthy();
});
