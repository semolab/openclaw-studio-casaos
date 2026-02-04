import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/studio", async (route, request) => {
    if (request.method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: { version: 1, gateway: null, focused: {}, sessions: {} },
        }),
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
      body: JSON.stringify({
        settings: { version: 1, gateway: null, focused: {}, sessions: {} },
      }),
    });
  });
});

test("connection panel reflects disconnected state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Disconnected").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
});
