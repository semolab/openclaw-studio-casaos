import { describe, expect, it } from "vitest";

import type { Project, ProjectsStore } from "@/lib/projects/types";
import { normalizeProjectsStore } from "@/app/api/projects/store";

const makeProject = (id: string): Project => ({
  id,
  name: `Project ${id}`,
  repoPath: `/tmp/${id}`,
  createdAt: 1,
  updatedAt: 1,
  tiles: [],
});

describe("projectsStore", () => {
  it("normalizesEmptyProjects", () => {
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: "missing",
      projects: [],
    };
    const normalized = normalizeProjectsStore(store);
    expect(normalized.version).toBe(2);
    expect(normalized.activeProjectId).toBeNull();
    expect(normalized.projects).toEqual([]);
  });

  it("fallsBackToFirstProject", () => {
    const projectA = makeProject("a");
    const projectB = makeProject("b");
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: "missing",
      projects: [projectA, projectB],
    };
    const normalized = normalizeProjectsStore(store);
    expect(normalized.activeProjectId).toBe("a");
  });

  it("preservesActiveProject", () => {
    const projectA = makeProject("a");
    const projectB = makeProject("b");
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: "b",
      projects: [projectA, projectB],
    };
    const normalized = normalizeProjectsStore(store);
    expect(normalized.activeProjectId).toBe("b");
  });

  it("normalizesNonArrayProjects", () => {
    const store = {
      version: 2,
      activeProjectId: "missing",
      projects: "nope",
    } as unknown as ProjectsStore;
    const normalized = normalizeProjectsStore(store);
    expect(normalized.projects).toEqual([]);
    expect(normalized.activeProjectId).toBeNull();
  });
});
