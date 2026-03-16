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
  await page.getByLabel("Steps to reproduce").fill("1. Open the map\n2. Run a simulation\n3. Observe the error");
  await page.getByLabel("Expected behavior").fill("Simulation should complete.");
  await page.getByLabel("Actual behavior").fill("Simulation returns a 500 response.");
  await page.getByRole("button", { name: "Submit bug report" }).click();

  await expect(page.getByText("Report submitted")).toBeVisible();
  await expect(page.getByRole("link", { name: "View issue" })).toHaveAttribute(
    "href",
    /github\.com\/faizm10\/transit-flow\/issues\/99999/,
  );
});
