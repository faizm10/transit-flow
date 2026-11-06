import { expect, test, type Page } from "@playwright/test";

/**
 * The map page's main flow: Explore → Design → Test → Share.
 *
 * None of these assertions need the map canvas. CI's headless Chromium may
 * not have WebGL, and the page must stay usable without it, so the panels are
 * what's under test here.
 */

const ROUTE = {
  id: "e2e-route",
  name: "E2E Express",
  color: "#e11d48",
  type: "train",
  createdAt: "2026-01-01T00:00:00Z",
  stops: [
    { id: "a", name: "Burlington GO", lat: 43.3406, lon: -79.8091, sequence: 1 },
    { id: "b", name: "Union Station GO", lat: 43.6453, lon: -79.3806, sequence: 2 },
  ],
  schedule: { type: "fixed", direction: "two-way", fixedDepartures: ["07:15", "07:45", "08:15"] },
};

async function seedRoutes(page: Page, routes: unknown[]) {
  await page.addInitScript((value) => {
    localStorage.setItem("transitflow_custom_routes", value);
  }, JSON.stringify(routes));
}

const steps = (page: Page) => page.getByRole("navigation", { name: "TransitFlow steps" }).filter({ visible: true });

test("the steps read Explore, Design, Test, Share", async ({ page }) => {
  await page.goto("/map?mode=browse");
  const nav = steps(page);
  for (const label of ["Explore", "Design", "Test", "Share"]) {
    await expect(nav.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  }
  await expect(nav.getByRole("button", { name: /Explore/ })).toHaveAttribute("aria-current", "step");
});

test("Test step without routes points to Design", async ({ page }) => {
  await seedRoutes(page, []);
  await page.goto("/map?mode=test");
  await expect(page.getByRole("heading", { name: "Test your route" })).toBeVisible();
  await expect(page.getByText(/haven.t designed a route yet/)).toBeVisible();

  await page.getByRole("button", { name: "Design a route" }).click();
  await expect(page).toHaveURL(/mode=build/);
});

test("Share without routes explains what to do", async ({ page }) => {
  await seedRoutes(page, []);
  await page.goto("/map?mode=browse");
  await steps(page).getByRole("button", { name: /Share/ }).click();
  await expect(page.getByText("Nothing to share yet. Design a route first.")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Browse community designs/ })).toBeVisible();
});

test("a saved route can be tested and its network impact checked", async ({ page }) => {
  await seedRoutes(page, [ROUTE]);
  await page.goto("/map?mode=test");

  await expect(page.getByText("E2E Express")).toBeVisible();
  await page.getByRole("button", { name: /Check network impact/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /What does E2E Express change/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Run analysis" }).click();

  // The report runs in a worker; the dialog stays interactive meanwhile.
  await expect(dialog.getByText("Journeys faster")).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText(/Travel options, not passengers/)).toBeVisible();
});

test("saved route actions are grouped in one menu", async ({ page }) => {
  await seedRoutes(page, [ROUTE]);
  await page.goto("/map?mode=browse");
  await page.getByRole("tab", { name: /Mine/ }).click();
  await page.getByRole("button", { name: "Actions for E2E Express" }).click();
  for (const item of ["Try a journey", "Check network impact", "Share to community", "Delete"]) {
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  }
});

test("phones get a bottom tab bar and a bottom-sheet panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedRoutes(page, [ROUTE]);
  await page.goto("/map?mode=test");

  const nav = steps(page);
  const navBox = await nav.boundingBox();
  expect(navBox && navBox.y + navBox.height).toBeGreaterThan(800);

  const panel = page.getByRole("heading", { name: "Test your route" });
  const panelBox = await panel.boundingBox();
  expect(panelBox && navBox && panelBox.y < navBox.y).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
