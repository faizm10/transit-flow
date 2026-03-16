import { expect, test } from "@playwright/test";

test("landing page and map shell load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Plan transit on one board." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send feedback" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Report a bug" }).first()).toBeVisible();

  await page.goto("/map");
  await expect(page.getByRole("button", { name: "Networks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Builder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report bug" })).toBeVisible();
});

test("core transit APIs return data", async ({ request }) => {
  const [upx, coverage, frequency, simulation] = await Promise.all([
    request.get("/api/union-pearson"),
    request.get("/api/gotransit/coverage"),
    request.get("/api/gotransit/frequency"),
    request.get("/api/simulation?date=2026-03-17&start=05:30&end=13:00&routeShortNames=BR&routeTypes=2"),
  ]);

  expect(upx.ok()).toBeTruthy();
  expect(coverage.ok()).toBeTruthy();
  expect(frequency.ok()).toBeTruthy();
  expect(simulation.ok()).toBeTruthy();

  const upxData = await upx.json();
  const coverageData = await coverage.json();
  const frequencyData = await frequency.json();
  const simulationData = await simulation.json();

  expect(Array.isArray(upxData.features)).toBeTruthy();
  expect(Array.isArray(coverageData.features)).toBeTruthy();
  expect(Array.isArray(frequencyData.results)).toBeTruthy();
  expect(Array.isArray(simulationData.trips)).toBeTruthy();
});

test("community page submits a dry-run bug report", async ({ page, request }) => {
  const invalid = await request.post("/api/community/report", {
    data: {
      type: "bug",
      title: "",
      description: "",
    },
  });
  expect(invalid.status()).toBe(400);

  await page.goto("/community?type=bug");
  await expect(page.getByRole("heading", { name: "Report bugs and send product feedback." })).toBeVisible();

  await page.getByLabel("Title").fill("Simulation chunk failed");
  await page.getByLabel("Description").fill("The simulation route returned an error during chunk processing.");
  await page.getByRole("button", { name: "Submit bug report" }).click();

  await expect(page.getByText("Report submitted")).toBeVisible();
  await expect(page.getByRole("link", { name: "View issue" })).toHaveAttribute(
    "href",
    /github\.com\/faizm10\/transit-flow\/issues\/99999/,
  );
});
