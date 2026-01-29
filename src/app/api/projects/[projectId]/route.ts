import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  removeAgentEntry,
  updateClawdbotConfig,
} from "@/lib/clawdbot/config";
import { collectAgentIdsAndDeleteArtifacts } from "@/lib/projects/fs.server";
import { resolveProjectFromParams } from "@/app/api/projects/resolveResponse";
import { removeProjectFromStore, saveStore } from "../store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const resolved = await resolveProjectFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }
    const { store, projectId: resolvedProjectId, project } = resolved;

    const warnings: string[] = [];
    const agentIds = collectAgentIdsAndDeleteArtifacts(
      resolvedProjectId,
      project.tiles,
      warnings
    );
    const { warnings: configWarnings } = updateClawdbotConfig((config) => {
      let changed = false;
      for (const agentId of agentIds) {
        if (removeAgentEntry(config, agentId)) {
          changed = true;
        }
      }
      return changed;
    });
    warnings.push(...configWarnings);

    const { store: nextStore } = removeProjectFromStore(store, resolvedProjectId);
    saveStore(nextStore);
    return NextResponse.json({ store: nextStore, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete workspace.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
