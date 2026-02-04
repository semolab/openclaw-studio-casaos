import { expect, test } from "@playwright/test";

test("connection settings persist to the studio settings API", async ({ page }) => {
  await page.route("**/api/studio", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: { version: 1, gateway: null, focused: {}, sessions: {} },
        }),
      });
      return;
    }
    if (request.method() === "PUT") {
      const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: {
            version: 1,
            gateway: payload.gateway ?? null,
            focused: {},
            sessions: {},
          },
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");

  await page.getByLabel("Gateway URL").fill("ws://gateway.example:18789");
  await page.getByLabel("Token").fill("token-123");

  const request = await page.waitForRequest((req) => {
    if (!req.url().includes("/api/studio") || req.method() !== "PUT") {
      return false;
    }
    const payload = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
    const gateway = (payload.gateway ?? {}) as { url?: string; token?: string };
    return gateway.url === "ws://gateway.example:18789" && gateway.token === "token-123";
  });

  const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
  const gateway = (payload.gateway ?? {}) as { url?: string; token?: string };
  expect(gateway.url).toBe("ws://gateway.example:18789");
  expect(gateway.token).toBe("token-123");
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
});
