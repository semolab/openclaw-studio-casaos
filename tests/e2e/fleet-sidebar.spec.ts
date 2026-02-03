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

test("switches_active_agent_from_sidebar", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("fleet-sidebar")).toBeVisible();
  await expect(page.getByTestId("focused-agent-panel")).toBeVisible();
  await expect(
    page.getByTestId("fleet-sidebar").getByText("No agents available.")
  ).toBeVisible();
});

test("applies_attention_filters", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("fleet-filter-needs-attention").click();
  await expect(page.getByTestId("fleet-filter-needs-attention")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByTestId("fleet-filter-running").click();
  await expect(page.getByTestId("fleet-filter-running")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByTestId("fleet-filter-idle").click();
  await expect(page.getByTestId("fleet-filter-idle")).toHaveAttribute("aria-pressed", "true");
});
