import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { syncGatewaySessionSettings } from "@/lib/gateway/GatewayClient";
import {
  readGatewayAgentExecApprovals,
  upsertGatewayAgentExecApprovals,
} from "@/lib/gateway/execApprovals";
import { readConfigAgentList, updateGatewayAgentOverrides } from "@/lib/gateway/agentConfig";

export type ExecutionRoleId = "conservative" | "collaborative" | "autonomous";

export function resolveExecApprovalsPolicyForRole(params: {
  role: ExecutionRoleId;
  allowlist: Array<{ pattern: string }>;
}):
  | {
      security: "full" | "allowlist";
      ask: "off" | "always";
      allowlist: Array<{ pattern: string }>;
    }
  | null {
  if (params.role === "conservative") return null;
  if (params.role === "autonomous") {
    return { security: "full", ask: "off", allowlist: params.allowlist };
  }
  return { security: "allowlist", ask: "always", allowlist: params.allowlist };
}

const coerceStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export function resolveRuntimeToolOverridesForRole(params: {
  role: ExecutionRoleId;
  existingTools: unknown;
}): { tools: { allow?: string[]; alsoAllow?: string[]; deny?: string[] } } {
  const tools = isRecord(params.existingTools) ? params.existingTools : null;

  const existingAllow = coerceStringArray(tools?.allow);
  const existingAlsoAllow = coerceStringArray(tools?.alsoAllow);
  const existingDeny = coerceStringArray(tools?.deny) ?? [];

  const usesAllow = existingAllow !== null;
  const baseAllowed = new Set(usesAllow ? existingAllow : existingAlsoAllow ?? []);
  const deny = new Set(existingDeny);

  if (params.role === "conservative") {
    baseAllowed.delete("group:runtime");
    deny.add("group:runtime");
  } else {
    baseAllowed.add("group:runtime");
    deny.delete("group:runtime");
  }

  const allowedList = Array.from(baseAllowed);
  const denyList = Array.from(deny).filter((entry) => !baseAllowed.has(entry));

  return {
    tools: usesAllow ? { allow: allowedList, deny: denyList } : { alsoAllow: allowedList, deny: denyList },
  };
}

export function resolveSessionExecSettingsForRole(params: {
  role: ExecutionRoleId;
  sandboxMode: string;
}): {
  execHost: "sandbox" | "gateway" | null;
  execSecurity: "deny" | "allowlist" | "full";
  execAsk: "off" | "always";
} {
  if (params.role === "conservative") {
    return { execHost: null, execSecurity: "deny", execAsk: "off" };
  }

  const normalizedMode = params.sandboxMode.trim().toLowerCase();
  const execHost = normalizedMode === "all" ? "sandbox" : "gateway";
  if (params.role === "autonomous") {
    return { execHost, execSecurity: "full", execAsk: "off" };
  }
  return { execHost, execSecurity: "allowlist", execAsk: "always" };
}

export async function updateExecutionRoleViaStudio(params: {
  client: GatewayClient;
  agentId: string;
  sessionKey: string;
  role: ExecutionRoleId;
  loadAgents: () => Promise<void>;
}): Promise<void> {
  const agentId = params.agentId.trim();
  if (!agentId) {
    throw new Error("Agent id is required.");
  }

  const existingPolicy = await readGatewayAgentExecApprovals({
    client: params.client,
    agentId,
  });
  const allowlist = existingPolicy?.allowlist ?? [];
  const nextPolicy = resolveExecApprovalsPolicyForRole({ role: params.role, allowlist });

  await upsertGatewayAgentExecApprovals({
    client: params.client,
    agentId,
    policy: nextPolicy,
  });

  const snapshot = await params.client.call<{ config?: unknown }>("config.get", {});
  const baseConfig =
    snapshot.config && typeof snapshot.config === "object" && !Array.isArray(snapshot.config)
      ? (snapshot.config as Record<string, unknown>)
      : undefined;

  const list = readConfigAgentList(baseConfig);
  const configEntry = list.find((entry) => entry.id === agentId) ?? null;

  const sandboxRaw =
    configEntry && typeof (configEntry as Record<string, unknown>).sandbox === "object"
      ? ((configEntry as Record<string, unknown>).sandbox as unknown)
      : null;
  const sandbox =
    sandboxRaw && typeof sandboxRaw === "object" && !Array.isArray(sandboxRaw)
      ? (sandboxRaw as Record<string, unknown>)
      : null;
  const sandboxMode = typeof sandbox?.mode === "string" ? sandbox.mode.trim().toLowerCase() : "";

  const toolsRaw =
    configEntry && typeof (configEntry as Record<string, unknown>).tools === "object"
      ? ((configEntry as Record<string, unknown>).tools as unknown)
      : null;
  const tools =
    toolsRaw && typeof toolsRaw === "object" && !Array.isArray(toolsRaw)
      ? (toolsRaw as Record<string, unknown>)
      : null;

  const toolOverrides = resolveRuntimeToolOverridesForRole({
    role: params.role,
    existingTools: tools,
  });
  await updateGatewayAgentOverrides({
    client: params.client,
    agentId,
    overrides: toolOverrides,
  });

  const execSettings = resolveSessionExecSettingsForRole({
    role: params.role,
    sandboxMode,
  });
  await syncGatewaySessionSettings({
    client: params.client,
    sessionKey: params.sessionKey,
    execHost: execSettings.execHost,
    execSecurity: execSettings.execSecurity,
    execAsk: execSettings.execAsk,
  });

  await params.loadAgents();
}

