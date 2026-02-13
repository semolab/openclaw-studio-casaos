import { describe, expect, it, vi } from "vitest";
import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import {
  removePendingGuidedSetup,
  upsertPendingGuidedSetup,
} from "@/features/agents/creation/recovery";
import {
  beginPendingGuidedSetupRetry,
  endPendingGuidedSetupRetry,
} from "@/features/agents/creation/pendingSetupRetry";
import {
  resolveGuidedCreateCompletion,
  runGuidedCreateWorkflow,
  runGuidedRetryWorkflow,
} from "@/features/agents/operations/guidedCreateWorkflow";

const createSetup = (): AgentGuidedSetup => ({
  agentOverrides: {
    sandbox: { mode: "non-main", workspaceAccess: "ro" },
    tools: { profile: "coding", alsoAllow: ["group:runtime"], deny: ["group:web"] },
  },
  files: {
    "AGENTS.md": "# Mission",
  },
  execApprovals: {
    security: "allowlist",
    ask: "always",
    allowlist: [{ pattern: "/usr/bin/git" }],
  },
});

describe("guidedCreateWorkflow integration", () => {
  it("maps workflow pending outcome to pending setup map update and user error banner", async () => {
    const setup = createSetup();
    const pendingByAgentId: Record<string, AgentGuidedSetup> = {};
    const createAgent = vi.fn(async () => ({ id: "agent-1" }));
    const applySetup = vi.fn(async () => {
      throw new Error("setup failed");
    });

    const result = await runGuidedCreateWorkflow(
      {
        name: "Agent One",
        setup,
        isLocalGateway: true,
      },
      {
        createAgent,
        applySetup,
        upsertPending: (agentId, value) => {
          pendingByAgentId[agentId] = value;
        },
        removePending: (agentId) => {
          delete pendingByAgentId[agentId];
        },
      }
    );

    const completion = resolveGuidedCreateCompletion({
      agentName: "Agent One",
      result,
    });

    expect(result.setupStatus).toBe("pending");
    expect(pendingByAgentId).toEqual({ "agent-1": setup });
    expect(completion.pendingErrorMessage).toBe(
      'Agent "Agent One" was created, but guided setup is pending. Retry or discard setup from chat. setup failed'
    );
  });

  it("maps workflow applied outcome to modal close and reload path", async () => {
    const setup = createSetup();
    const pendingByAgentId: Record<string, AgentGuidedSetup> = { "agent-2": setup };

    const result = await runGuidedCreateWorkflow(
      {
        name: "Agent Two",
        setup,
        isLocalGateway: true,
      },
      {
        createAgent: async () => ({ id: "agent-2" }),
        applySetup: async () => undefined,
        upsertPending: (agentId, value) => {
          pendingByAgentId[agentId] = value;
        },
        removePending: (agentId) => {
          delete pendingByAgentId[agentId];
        },
      }
    );

    const completion = resolveGuidedCreateCompletion({
      agentName: "Agent Two",
      result,
    });

    expect(completion).toEqual({
      shouldReloadAgents: true,
      shouldCloseCreateModal: true,
      pendingErrorMessage: null,
    });
    expect(pendingByAgentId).toEqual({});
  });

  it("manual retry path uses workflow retry outcome and clears busy state", async () => {
    const setup = createSetup();
    const pendingByAgentId: Record<string, AgentGuidedSetup> = { "agent-3": setup };
    let busyAgentId: string | null = null;

    const manualRetry = async (agentId: string) => {
      busyAgentId = agentId;
      try {
        return await runGuidedRetryWorkflow(agentId, {
          applyPendingSetup: async (resolvedAgentId) => {
            return { applied: resolvedAgentId === "agent-3" };
          },
          removePending: (resolvedAgentId) => {
            delete pendingByAgentId[resolvedAgentId];
          },
        });
      } finally {
        busyAgentId = busyAgentId === agentId ? null : busyAgentId;
      }
    };

    const result = await manualRetry("agent-3");

    expect(result).toEqual({ applied: true });
    expect(pendingByAgentId).toEqual({});
    expect(busyAgentId).toBeNull();
  });

  it("preserves pending setup entry ordering and replacement semantics across retries", async () => {
    const setupA1 = createSetup();
    const setupA2 = {
      ...createSetup(),
      files: { "AGENTS.md": "# Updated mission" },
    };
    const setupB = createSetup();
    let pendingByAgentId: Record<string, AgentGuidedSetup> = {};
    pendingByAgentId = upsertPendingGuidedSetup(pendingByAgentId, "agent-b", setupB);
    pendingByAgentId = upsertPendingGuidedSetup(pendingByAgentId, "agent-a", setupA1);

    await runGuidedRetryWorkflow("agent-a", {
      applyPendingSetup: async () => ({ applied: true }),
      removePending: (agentId) => {
        pendingByAgentId = removePendingGuidedSetup(pendingByAgentId, agentId);
      },
    });

    expect(Object.keys(pendingByAgentId)).toEqual(["agent-b"]);

    pendingByAgentId = upsertPendingGuidedSetup(pendingByAgentId, "agent-a", setupA2);

    expect(Object.keys(pendingByAgentId)).toEqual(["agent-b", "agent-a"]);
    expect(pendingByAgentId["agent-a"]).toEqual(setupA2);
  });

  it("does not schedule duplicate retry when in-flight guard is set", async () => {
    const inFlightAgentIds = new Set<string>();
    const startedFirst = beginPendingGuidedSetupRetry(inFlightAgentIds, "agent-guarded");
    const startedSecond = beginPendingGuidedSetupRetry(inFlightAgentIds, "agent-guarded");

    expect(startedFirst).toBe(true);
    expect(startedSecond).toBe(false);

    if (startedFirst) {
      await runGuidedRetryWorkflow("agent-guarded", {
        applyPendingSetup: async () => ({ applied: true }),
        removePending: () => undefined,
      });
    }
    endPendingGuidedSetupRetry(inFlightAgentIds, "agent-guarded");

    expect(inFlightAgentIds.has("agent-guarded")).toBe(false);
  });
});
