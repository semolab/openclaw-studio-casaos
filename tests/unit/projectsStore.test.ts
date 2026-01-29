import { describe, expect, it } from "vitest";

import type { Project, ProjectTile, ProjectsStore } from "@/lib/projects/types";
import {
  addTileToProject,
  appendProjectToStore,
  normalizeProjectsStore,
  removeProjectFromStore,
  removeTileFromProject,
  updateTileInProject,
} from "@/app/api/projects/store";

const makeProject = (id: string): Project => ({
  id,
  name: `Project ${id}`,
  repoPath: `/tmp/${id}`,
  createdAt: 1,
  updatedAt: 1,
  tiles: [],
});

const makeTile = (id: string): ProjectTile => ({
  id,
  name: `Tile ${id}`,
  agentId: `agent-${id}`,
  role: "coding",
  sessionKey: `agent:agent-${id}:main`,
  model: "openai-codex/gpt-5.2-codex",
  thinkingLevel: null,
  avatarSeed: `agent-${id}`,
  position: { x: 0, y: 0 },
  size: { width: 420, height: 520 },
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

describe("store mutations", () => {
  it("adds a project and sets it active", () => {
    const store: ProjectsStore = { version: 2, activeProjectId: null, projects: [] };
    const project = makeProject("next");
    const nextStore = appendProjectToStore(store, project);
    expect(nextStore.activeProjectId).toBe(project.id);
    expect(nextStore.projects).toEqual([project]);
  });

  it("removes a project and normalizes active selection", () => {
    const projectA = makeProject("a");
    const projectB = makeProject("b");
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: projectA.id,
      projects: [projectA, projectB],
    };
    const result = removeProjectFromStore(store, projectA.id);
    expect(result.removed).toBe(true);
    expect(result.store.projects).toEqual([projectB]);
    expect(result.store.activeProjectId).toBe(projectB.id);
  });

  it("adds a tile and updates updatedAt", () => {
    const now = 123;
    const project = makeProject("a");
    const tile = makeTile("1");
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: project.id,
      projects: [project],
    };
    const nextStore = addTileToProject(store, project.id, tile, now);
    const updatedProject = nextStore.projects[0];
    expect(updatedProject.tiles).toEqual([tile]);
    expect(updatedProject.updatedAt).toBe(now);
  });

  it("updates a tile and updates updatedAt", () => {
    const now = 456;
    const project = makeProject("a");
    const tile = makeTile("1");
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: project.id,
      projects: [{ ...project, tiles: [tile] }],
    };
    const nextStore = updateTileInProject(
      store,
      project.id,
      tile.id,
      { name: "Updated" },
      now
    );
    const updatedProject = nextStore.projects[0];
    expect(updatedProject.tiles[0].name).toBe("Updated");
    expect(updatedProject.updatedAt).toBe(now);
  });

  it("removes a tile and reports removal", () => {
    const now = 789;
    const project = makeProject("a");
    const tile = makeTile("1");
    const store: ProjectsStore = {
      version: 2,
      activeProjectId: project.id,
      projects: [{ ...project, tiles: [tile] }],
    };
    const result = removeTileFromProject(store, project.id, tile.id, now);
    const updatedProject = result.store.projects[0];
    expect(result.removed).toBe(true);
    expect(updatedProject.tiles).toEqual([]);
    expect(updatedProject.updatedAt).toBe(now);
  });
});
