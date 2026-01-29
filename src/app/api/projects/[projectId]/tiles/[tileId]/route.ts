import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import type { ProjectTileUpdatePayload } from "@/lib/projects/types";
import { resolveAgentWorkspaceDir } from "@/lib/projects/agentWorkspace";
import { collectAgentIdsAndDeleteArtifacts } from "@/lib/projects/fs.server";
import { resolveProjectTileFromParams } from "@/app/api/projects/resolveResponse";
import {
  removeAgentEntry,
  updateClawdbotConfig,
  upsertAgentEntry,
} from "@/lib/clawdbot/config";
import { removeTileFromProject, saveStore, updateTileInProject } from "../../../store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; tileId: string }> }
) {
  try {
    const resolved = await resolveProjectTileFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }
    const { store, projectId: resolvedProjectId, tileId: resolvedTileId, tile } = resolved;

    const warnings: string[] = [];
    const agentIds = collectAgentIdsAndDeleteArtifacts(
      resolvedProjectId,
      [tile],
      warnings
    );
    if (agentIds.length > 0) {
      const { warnings: configWarnings } = updateClawdbotConfig((config) =>
        removeAgentEntry(config, agentIds[0])
      );
      warnings.push(...configWarnings);
    }

    const { store: nextStore, removed } = removeTileFromProject(
      store,
      resolvedProjectId,
      resolvedTileId
    );
    if (!removed) {
      return NextResponse.json({ error: "Tile not found." }, { status: 404 });
    }
    saveStore(nextStore);
    return NextResponse.json({ store: nextStore, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete tile.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; tileId: string }> }
) {
  try {
    const body = (await request.json()) as ProjectTileUpdatePayload;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const avatarSeed =
      typeof body?.avatarSeed === "string" ? body.avatarSeed.trim() : "";
    if (!name && !avatarSeed) {
      return NextResponse.json(
        { error: "Tile update requires a name or avatar seed." },
        { status: 400 }
      );
    }
    if (body?.avatarSeed !== undefined && !avatarSeed) {
      return NextResponse.json({ error: "Avatar seed is invalid." }, { status: 400 });
    }

    const resolved = await resolveProjectTileFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }
    const { store, projectId: resolvedProjectId, tileId: resolvedTileId, tile } = resolved;

    const warnings: string[] = [];
    if (name) {
      const nextWorkspaceDir = resolveAgentWorkspaceDir(
        resolvedProjectId,
        tile.agentId
      );
      const { warnings: configWarnings } = updateClawdbotConfig((config) =>
        upsertAgentEntry(config, {
          agentId: tile.agentId,
          agentName: name,
          workspaceDir: nextWorkspaceDir,
        })
      );
      warnings.push(...configWarnings);
    }

    const patch = {
      ...(name ? { name } : {}),
      ...(avatarSeed ? { avatarSeed } : {}),
    };
    const nextStore = updateTileInProject(
      store,
      resolvedProjectId,
      resolvedTileId,
      patch
    );
    saveStore(nextStore);
    return NextResponse.json({ store: nextStore, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rename tile.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
