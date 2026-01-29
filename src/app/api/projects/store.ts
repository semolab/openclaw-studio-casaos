import fs from "node:fs";
import path from "node:path";

import type { Project, ProjectTile, ProjectsStore } from "@/lib/projects/types";
import { resolveAgentCanvasDir } from "@/lib/projects/agentWorkspace";

const STORE_VERSION: ProjectsStore["version"] = 2;
const STORE_DIR = resolveAgentCanvasDir();
const STORE_PATH = path.join(STORE_DIR, "projects.json");

export type ProjectsStorePayload = ProjectsStore;

export const ensureStoreDir = () => {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
};

export const defaultStore = (): ProjectsStore => ({
  version: STORE_VERSION,
  activeProjectId: null,
  projects: [],
});

export const normalizeProjectsStore = (store: ProjectsStore): ProjectsStore => {
  const projects = Array.isArray(store.projects) ? store.projects : [];
  const activeProjectId =
    typeof store.activeProjectId === "string" &&
    projects.some((project) => project.id === store.activeProjectId)
      ? store.activeProjectId
      : projects[0]?.id ?? null;
  return {
    version: STORE_VERSION,
    activeProjectId,
    projects,
  };
};

export const appendProjectToStore = (
  store: ProjectsStore,
  project: Project
): ProjectsStore =>
  normalizeProjectsStore({
    version: STORE_VERSION,
    activeProjectId: project.id,
    projects: [...store.projects, project],
  });

export const removeProjectFromStore = (
  store: ProjectsStore,
  projectId: string
): { store: ProjectsStore; removed: boolean } => {
  const projects = store.projects.filter((project) => project.id !== projectId);
  const removed = projects.length !== store.projects.length;
  return {
    store: normalizeProjectsStore({
      version: STORE_VERSION,
      activeProjectId: store.activeProjectId,
      projects,
    }),
    removed,
  };
};

export const addTileToProject = (
  store: ProjectsStore,
  projectId: string,
  tile: ProjectTile,
  now: number = Date.now()
): ProjectsStore => ({
  ...store,
  version: STORE_VERSION,
  projects: store.projects.map((project) =>
    project.id === projectId
      ? { ...project, tiles: [...project.tiles, tile], updatedAt: now }
      : project
  ),
});

export const updateTileInProject = (
  store: ProjectsStore,
  projectId: string,
  tileId: string,
  patch: Partial<ProjectTile>,
  now: number = Date.now()
): ProjectsStore => ({
  ...store,
  version: STORE_VERSION,
  projects: store.projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          tiles: project.tiles.map((tile) =>
            tile.id === tileId ? { ...tile, ...patch } : tile
          ),
          updatedAt: now,
        }
      : project
  ),
});

export const removeTileFromProject = (
  store: ProjectsStore,
  projectId: string,
  tileId: string,
  now: number = Date.now()
): { store: ProjectsStore; removed: boolean } => {
  let removed = false;
  const nextStore = {
    ...store,
    version: STORE_VERSION,
    projects: store.projects.map((project) => {
      if (project.id !== projectId) return project;
      const nextTiles = project.tiles.filter((tile) => tile.id !== tileId);
      removed = removed || nextTiles.length !== project.tiles.length;
      return { ...project, tiles: nextTiles, updatedAt: now };
    }),
  };
  return { store: nextStore, removed };
};

const parseAgentId = (sessionKey: string): string => {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match ? match[1] : "main";
};

type RawTile = {
  id: string;
  name: string;
  sessionKey: string;
  model?: string | null;
  thinkingLevel?: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  agentId?: string;
  role?: "coding" | "research" | "marketing";
};

type RawProject = Omit<Project, "tiles"> & { tiles: RawTile[] };

type RawStore = {
  version?: number;
  activeProjectId?: string | null;
  projects?: RawProject[];
};

const migrateV1Store = (store: { activeProjectId?: string | null; projects: RawProject[] }) => {
  const projects = store.projects.map((project) => ({
    ...project,
    tiles: project.tiles.map((tile) => ({
      ...tile,
      agentId: parseAgentId(typeof tile.sessionKey === "string" ? tile.sessionKey : ""),
      role: "coding" as const,
    })),
  }));
  return {
    version: STORE_VERSION,
    activeProjectId: store.activeProjectId ?? null,
    projects,
  };
};

export const loadStore = (): ProjectsStore => {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) {
    const seed = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as RawStore;
    if (!parsed || !Array.isArray(parsed.projects)) {
      throw new Error(`Workspaces store is invalid at ${STORE_PATH}.`);
    }
    if (!parsed.projects.every((project) => Array.isArray(project.tiles))) {
      throw new Error(`Workspaces store is invalid at ${STORE_PATH}.`);
    }
    if (parsed.version === 2) {
      return parsed as ProjectsStore;
    }
    const migrated = migrateV1Store({
      activeProjectId: parsed.activeProjectId ?? null,
      projects: parsed.projects,
    });
    saveStore(migrated);
    return migrated;
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error.";
    if (details.includes(STORE_PATH)) {
      throw new Error(details);
    }
    throw new Error(`Failed to parse workspaces store at ${STORE_PATH}: ${details}`);
  }
};

export const saveStore = (store: ProjectsStore) => {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
};
