import { NextResponse } from "next/server";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { logger } from "@/lib/logger";
import type {
  ProjectTile,
  ProjectTileCreatePayload,
  ProjectTileCreateResult,
  ProjectTileRole,
} from "@/lib/projects/types";
import { resolveAgentWorkspaceDir } from "@/lib/projects/agentWorkspace";
import { resolveStateDir } from "@/lib/clawdbot/paths";
import { resolveProjectFromParams } from "@/app/api/projects/resolveResponse";
import {
  updateClawdbotConfig,
  upsertAgentEntry,
} from "@/lib/clawdbot/config";
import { generateAgentId } from "@/lib/ids/agentId";
import { provisionWorkspaceFiles } from "@/lib/projects/workspaceFiles.server";
import { addTileToProject, saveStore } from "../../store";
import { buildSessionKey } from "@/lib/projects/sessionKey";

export const runtime = "nodejs";

const ROLE_VALUES: ProjectTileRole[] = ["coding", "research", "marketing"];

const copyAuthProfiles = (agentId: string): string[] => {
  const warnings: string[] = [];
  const stateDir = resolveStateDir();
  const sourceAgentId = process.env.CLAWDBOT_DEFAULT_AGENT_ID ?? "main";
  const source = path.join(stateDir, "agents", sourceAgentId, "agent", "auth-profiles.json");
  const destination = path.join(stateDir, "agents", agentId, "agent", "auth-profiles.json");

  if (fs.existsSync(destination)) {
    return warnings;
  }
  if (!fs.existsSync(source)) {
    warnings.push(`No auth profiles found at ${source}; agent may need login.`);
    return warnings;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return warnings;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = (await request.json()) as ProjectTileCreatePayload;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const role = body?.role;
    if (!name) {
      return NextResponse.json({ error: "Tile name is required." }, { status: 400 });
    }
    if (!role || !ROLE_VALUES.includes(role)) {
      return NextResponse.json({ error: "Tile role is invalid." }, { status: 400 });
    }

    const resolved = await resolveProjectFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }
    const { store, projectId: resolvedProjectId, project } = resolved;

    const tileId = randomUUID();
    const projectSlug = path.basename(project.repoPath);
    let agentId = "";
    try {
      agentId = generateAgentId({ projectSlug, tileName: name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid agent name.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (project.tiles.some((entry) => entry.agentId === agentId)) {
      return NextResponse.json(
        { error: `Agent id already exists: ${agentId}` },
        { status: 409 }
      );
    }
    const sessionKey = buildSessionKey(agentId);
    const offset = project.tiles.length * 36;
    const workspaceDir = resolveAgentWorkspaceDir(resolvedProjectId, agentId);
    const tile: ProjectTile = {
      id: tileId,
      name,
      agentId,
      role,
      sessionKey,
      model: "openai-codex/gpt-5.2-codex",
      thinkingLevel: null,
      avatarSeed: agentId,
      position: { x: 80 + offset, y: 200 + offset },
      size: { width: 420, height: 520 },
    };

    const nextStore = addTileToProject(store, resolvedProjectId, tile);
    saveStore(nextStore);

    const { warnings: workspaceWarnings } = provisionWorkspaceFiles(workspaceDir);
    const warnings = [...workspaceWarnings, ...copyAuthProfiles(agentId)];
    const { warnings: configWarnings } = updateClawdbotConfig((config) =>
      upsertAgentEntry(config, {
        agentId,
        agentName: name,
        workspaceDir,
      })
    );
    warnings.push(...configWarnings);
    if (warnings.length > 0) {
      logger.warn(`Tile created with warnings: ${warnings.join(" ")}`);
    }

    const result: ProjectTileCreateResult = {
      store: nextStore,
      tile,
      warnings,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create tile.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
