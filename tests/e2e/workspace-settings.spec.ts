import { expect, test } from "@playwright/test";

import path from "node:path";

import type { ProjectsStore, WorkspaceSettingsResult } from "@/lib/projects/types";

test("workspace settings flow updates the header label", async ({ page }) => {
  let projectsStore: ProjectsStore = {
    version: 3,
    activeProjectId: null,
    projects: [],
  };
  let workspaceSettings: WorkspaceSettingsResult = {
    workspacePath: "/Users/default",
    workspaceName: "Workspace",
    defaultAgentId: "main",
    warnings: [],
  };

  await page.route("**/api/projects", async (route, request) => {
    if (request.method() !== "GET" && request.method() !== "PUT") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(projectsStore),
    });
  });

  await page.route("**/api/workspace", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(workspaceSettings),
      });
      return;
    }
    if (request.method() === "PUT") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        workspacePath?: string;
        workspaceName?: string;
      };
      const workspacePath = body.workspacePath ?? "";
      const workspaceName = body.workspaceName ?? path.basename(workspacePath);
      workspaceSettings = {
        workspacePath,
        workspaceName,
        defaultAgentId: "main",
        warnings: [],
      };
      projectsStore = {
        version: 3,
        activeProjectId: "project-1",
        projects: [
          {
            id: "project-1",
            name: workspaceName,
            repoPath: workspacePath,
            createdAt: 1,
            updatedAt: 1,
            archivedAt: null,
            tiles: [],
          },
        ],
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(workspaceSettings),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");

  await page.getByTestId("workspace-settings-toggle").click();
  await expect(page.getByTestId("workspace-settings-panel")).toBeVisible();

  await page.getByTestId("workspace-settings-path").fill("/Users/Demo Workspace");
  await page.getByTestId("workspace-settings-save").click();

  await expect(page.getByTestId("workspace-settings-panel")).toHaveCount(0);
  const workspaceBlock = page.getByText("Default workspace").locator("..");
  await expect(workspaceBlock.locator("p").nth(1)).toHaveText("Demo Workspace");
});
