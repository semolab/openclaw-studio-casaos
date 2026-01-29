import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createDiscordChannelForAgent } from "@/lib/discord/discordChannel";
import { resolveAgentWorkspaceDir } from "@/lib/projects/agentWorkspace";
import { resolveProjectFromParams } from "@/app/api/projects/resolveResponse";

export const runtime = "nodejs";

type DiscordChannelRequest = {
  guildId?: string;
  agentId: string;
  agentName: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = (await request.json()) as DiscordChannelRequest;
    const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : undefined;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const agentName = typeof body?.agentName === "string" ? body.agentName.trim() : "";
    if (!agentId || !agentName) {
      return NextResponse.json(
        { error: "Agent id and name are required." },
        { status: 400 }
      );
    }

    const resolved = await resolveProjectFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }

    const workspaceDir = resolveAgentWorkspaceDir(resolved.projectId, agentId);
    const result = await createDiscordChannelForAgent({
      agentId,
      agentName,
      guildId: guildId || undefined,
      workspaceDir,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Discord channel.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
