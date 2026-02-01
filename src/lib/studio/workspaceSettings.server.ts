import fs from "node:fs";
import path from "node:path";

import { loadClawdbotConfig } from "@/lib/clawdbot/config";
import {
  resolveDefaultAgentId,
  resolveDefaultWorkspacePath,
} from "@/lib/clawdbot/resolveDefaultAgent";
import { resolveAgentCanvasDir } from "@/lib/projects/worktrees.server";

type WorkspaceSettings = {
  workspacePath?: string;
  workspaceName?: string;
  updatedAt?: number;
};

const SETTINGS_FILENAME = "settings.json";

const resolveSettingsPath = () => path.join(resolveAgentCanvasDir(), SETTINGS_FILENAME);

const normalizeSettings = (raw: unknown): WorkspaceSettings => {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const workspacePath =
    typeof record.workspacePath === "string" ? record.workspacePath.trim() : "";
  const workspaceName =
    typeof record.workspaceName === "string" ? record.workspaceName.trim() : "";
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : undefined;
  return {
    ...(workspacePath ? { workspacePath } : {}),
    ...(workspaceName ? { workspaceName } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
};

export const loadWorkspaceSettings = (): WorkspaceSettings => {
  const settingsPath = resolveSettingsPath();
  if (!fs.existsSync(settingsPath)) return {};
  const raw = fs.readFileSync(settingsPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeSettings(parsed);
};

export const saveWorkspaceSettings = (settings: WorkspaceSettings) => {
  const settingsPath = resolveSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload: WorkspaceSettings = {
    ...normalizeSettings(settings),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(settingsPath, JSON.stringify(payload, null, 2), "utf8");
};

export const resolveWorkspaceSelection = (): {
  workspacePath: string | null;
  workspaceName: string | null;
  warnings: string[];
} => {
  const warnings: string[] = [];
  let workspacePath: string | null = null;
  let workspaceName: string | null = null;
  let source: "settings" | "config" | "fallback" = "fallback";
  const fallbackDefaultPath = resolveDefaultWorkspacePath(
    {},
    resolveDefaultAgentId({})
  );

  try {
    const settings = loadWorkspaceSettings();
    if (settings.workspacePath?.trim()) {
      workspacePath = settings.workspacePath.trim();
      source = "settings";
    }
    if (settings.workspaceName?.trim()) {
      workspaceName = settings.workspaceName.trim();
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load workspace settings.";
    warnings.push(message);
  }

  if (!workspacePath) {
    try {
      const { config } = loadClawdbotConfig();
      const defaultAgentId = resolveDefaultAgentId(config);
      const resolved = resolveDefaultWorkspacePath(config, defaultAgentId);
      if (resolved?.trim()) {
        workspacePath = resolved.trim();
        source = "config";
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load OpenClaw config.";
      warnings.push(message);
    }
  }

  if (!workspacePath && fallbackDefaultPath) {
    workspacePath = fallbackDefaultPath;
    source = "fallback";
  }

  if (!workspaceName && workspacePath) {
    const base = path.basename(workspacePath);
    workspaceName = base && base !== path.parse(workspacePath).root ? base : null;
  }

  if (workspacePath) {
    try {
      if (!fs.existsSync(workspacePath)) {
        if (workspacePath === fallbackDefaultPath && source !== "settings") {
          fs.mkdirSync(workspacePath, { recursive: true });
        } else {
          warnings.push(`Workspace path does not exist: ${workspacePath}`);
          workspacePath = null;
          workspaceName = null;
        }
      } else if (!fs.statSync(workspacePath).isDirectory()) {
        warnings.push(`Workspace path is not a directory: ${workspacePath}`);
        workspacePath = null;
        workspaceName = null;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to validate workspace path.";
      warnings.push(message);
      workspacePath = null;
      workspaceName = null;
    }
  }

  return { workspacePath, workspaceName, warnings };
};
