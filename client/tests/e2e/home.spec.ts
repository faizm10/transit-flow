import { expect, test } from "@playwright/test";

test("home page renders the main navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Plan better transit/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Map/i }).first()).toBeVisible();
});
