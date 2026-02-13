import type { GatewayStatus } from "@/features/agents/operations/gatewayRestartPolicy";

export type MutationWorkflowKind = "rename-agent" | "delete-agent";

export type MutationWorkflowResult = {
  disposition: "completed" | "awaiting-restart";
};

export type MutationWorkflowDeps = {
  executeMutation: () => Promise<void>;
  shouldAwaitRemoteRestart: () => Promise<boolean>;
};

export type MutationStatusBlock = {
  phase: "queued" | "mutating" | "awaiting-restart";
  sawDisconnect: boolean;
};

type MutationFailureMessageByKind = Record<MutationWorkflowKind, string>;

const FALLBACK_MUTATION_FAILURE_MESSAGE: MutationFailureMessageByKind = {
  "rename-agent": "Failed to rename agent.",
  "delete-agent": "Failed to delete agent.",
};

const assertMutationKind = (kind: string): MutationWorkflowKind => {
  if (kind === "rename-agent" || kind === "delete-agent") {
    return kind;
  }
  throw new Error(`Unknown config mutation kind: ${kind}`);
};

export const runConfigMutationWorkflow = async (
  params: { kind: MutationWorkflowKind; isLocalGateway: boolean },
  deps: MutationWorkflowDeps
): Promise<MutationWorkflowResult> => {
  const kind = assertMutationKind(params.kind);
  void kind;
  await deps.executeMutation();
  if (params.isLocalGateway) {
    return { disposition: "completed" };
  }
  const shouldAwaitRestart = await deps.shouldAwaitRemoteRestart();
  return {
    disposition: shouldAwaitRestart ? "awaiting-restart" : "completed",
  };
};

export const buildConfigMutationFailureMessage = (params: {
  kind: MutationWorkflowKind;
  error: unknown;
}): string => {
  const fallback = FALLBACK_MUTATION_FAILURE_MESSAGE[params.kind];
  if (params.error instanceof Error) {
    return params.error.message || fallback;
  }
  return fallback;
};

export const resolveConfigMutationStatusLine = (params: {
  block: MutationStatusBlock | null;
  status: GatewayStatus;
  mutatingLabel?: string;
}): string | null => {
  const { block, status } = params;
  if (!block) return null;
  if (block.phase === "queued") {
    return "Waiting for active runs to finish";
  }
  if (block.phase === "mutating") {
    return params.mutatingLabel ?? "Submitting config change";
  }
  if (!block.sawDisconnect) {
    return "Waiting for gateway to restart";
  }
  return status === "connected"
    ? "Gateway is back online, syncing agents"
    : "Gateway restart in progress";
};

export const buildAwaitingRestartPatch = () => {
  return {
    phase: "awaiting-restart" as const,
    sawDisconnect: false,
  };
};
