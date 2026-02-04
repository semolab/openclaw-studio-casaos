import { expect, test } from "@playwright/test";

test("loads focused studio empty state", async ({ page }) => {
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

  await page.goto("/");

  await expect(page.getByTestId("fleet-sidebar")).toBeVisible();
  await expect(page.getByTestId("focused-agent-panel")).toBeVisible();
});
