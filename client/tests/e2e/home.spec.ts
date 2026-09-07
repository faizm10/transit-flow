import { expect, test } from "@playwright/test";

test("home page renders the main navigation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Plan better transit/i })
  ).toBeVisible();

  // Assert the link's destination, not its label. This test previously looked
  // for "Open Map"; the CTA was reworded to "Open TransitFlow" and the test
  // silently started failing on main. Where the button *goes* is the thing
  // that must not break.
  await expect(page.locator('a[href="/map"]').first()).toBeVisible();
});

test("workspace shell renders", async ({ page }) => {
  await page.goto("/datasets");

  // Signed out, the workspace is browsable and prompts for sign-in. This
  // guards a real regression: the shell is a Server Component and the nav is a
  // Client Component, and passing icon components across that boundary made
  // every request 500 while the build still passed.
  await expect(page.getByRole("heading", { name: "Datasets" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Map" })).toHaveAttribute(
    "href",
    "/map"
  );
});
