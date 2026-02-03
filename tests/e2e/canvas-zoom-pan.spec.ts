import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/studio", async (route, request) => {
    if (request.method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {} } }),
      });
      return;
    }
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {} } }),
    });
  });
});

test("canvas renders controls when disconnected", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-canvas").click();

  const pane = page.locator(".react-flow__pane");
  await expect(pane).toBeVisible();

  const controls = page.locator(".react-flow__controls");
  await expect(controls).toBeVisible();
});

test("canvas renders minimap when disconnected", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-canvas").click();

  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible();
});
