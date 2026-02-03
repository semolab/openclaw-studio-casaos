import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/studio", async (route, request) => {
    if (request.method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {}, focused: {} } }),
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
      body: JSON.stringify({ settings: { version: 1, gateway: null, layouts: {}, focused: {} } }),
    });
  });
});

test("switches_to_canvas_mode", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("view-mode-canvas").click();
  await expect(page.getByTestId("view-mode-canvas")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Clean up" })).toBeVisible();
});

test("retains_drag_capability", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("view-mode-canvas").click();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.locator(".react-flow__controls")).toBeVisible();
});
