import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import {
  beginPendingGuidedSetupRetry,
  endPendingGuidedSetupRetry,
} from "@/features/agents/creation/pendingSetupRetry";
import {
  runPendingSetupRetryLifecycle,
  type PendingSetupRetrySource,
} from "@/features/agents/operations/pendingSetupLifecycleWorkflow";

type SetState<T> = (next: T | ((current: T) => T)) => void;

export const applyPendingGuidedSetupRetryViaStudio = async (params: {
  agentId: string;
  source: PendingSetupRetrySource;
  retryBusyAgentId: string | null;
  inFlightAgentIds: Set<string>;
  pendingSetupsByAgentId: Record<string, AgentGuidedSetup>;
  setRetryBusyAgentId: SetState<string | null>;
  executeRetry: (agentId: string) => Promise<{ applied: boolean }>;
  isDisconnectLikeError: (error: unknown) => boolean;
  resolveAgentName: (agentId: string) => string;
  onApplied: () => Promise<void> | void;
  onError: (message: string) => void;
}): Promise<boolean> => {
  const resolvedAgentId = params.agentId.trim();
  if (!resolvedAgentId) return false;
  if (params.retryBusyAgentId && params.retryBusyAgentId !== resolvedAgentId) {
    return false;
  }
  if (!beginPendingGuidedSetupRetry(params.inFlightAgentIds, resolvedAgentId)) {
    return false;
  }
  const pendingSetup = params.pendingSetupsByAgentId[resolvedAgentId] ?? null;
  if (!pendingSetup) {
    endPendingGuidedSetupRetry(params.inFlightAgentIds, resolvedAgentId);
    return false;
  }
  params.setRetryBusyAgentId(resolvedAgentId);
  try {
    return await runPendingSetupRetryLifecycle(
      {
        agentId: resolvedAgentId,
        source: params.source,
      },
      {
        executeRetry: params.executeRetry,
        isDisconnectLikeError: params.isDisconnectLikeError,
        resolveAgentName: params.resolveAgentName,
        onApplied: params.onApplied,
        onError: params.onError,
      }
    );
  } finally {
    endPendingGuidedSetupRetry(params.inFlightAgentIds, resolvedAgentId);
    params.setRetryBusyAgentId((current) =>
      current === resolvedAgentId ? null : current
    );
  }
};

