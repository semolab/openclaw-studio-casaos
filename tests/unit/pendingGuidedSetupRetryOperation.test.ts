import { describe, expect, it, vi } from "vitest";

import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import { applyPendingGuidedSetupRetryViaStudio } from "@/features/agents/operations/pendingGuidedSetupRetryOperation";

type SetState<T> = (next: T | ((current: T) => T)) => void;

const createState = <T,>(initial: T): { get: () => T; set: SetState<T> } => {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
    },
  };
};

describe("pendingGuidedSetupRetryOperation", () => {
  it("returns false when another retry is busy", async () => {
    const busy = createState<string | null>("other");
    const inFlight = new Set<string>();

    const result = await applyPendingGuidedSetupRetryViaStudio({
      agentId: "a1",
      source: "manual",
      retryBusyAgentId: busy.get(),
      inFlightAgentIds: inFlight,
      pendingSetupsByAgentId: { a1: {} as unknown as AgentGuidedSetup },
      setRetryBusyAgentId: busy.set,
      executeRetry: vi.fn(),
      isDisconnectLikeError: () => false,
      resolveAgentName: (agentId) => agentId,
      onApplied: vi.fn(),
      onError: vi.fn(),
    });

    expect(result).toBe(false);
    expect(inFlight.size).toBe(0);
    expect(busy.get()).toBe("other");
  });

  it("returns false and releases in-flight when setup is missing", async () => {
    const busy = createState<string | null>(null);
    const inFlight = new Set<string>();

    const result = await applyPendingGuidedSetupRetryViaStudio({
      agentId: "a1",
      source: "manual",
      retryBusyAgentId: busy.get(),
      inFlightAgentIds: inFlight,
      pendingSetupsByAgentId: {},
      setRetryBusyAgentId: busy.set,
      executeRetry: vi.fn(),
      isDisconnectLikeError: () => false,
      resolveAgentName: (agentId) => agentId,
      onApplied: vi.fn(),
      onError: vi.fn(),
    });

    expect(result).toBe(false);
    expect(inFlight.has("a1")).toBe(false);
    expect(busy.get()).toBe(null);
  });

  it("runs lifecycle and clears busy/in-flight after completion", async () => {
    const busy = createState<string | null>(null);
    const setBusy = vi.fn(busy.set);
    const inFlight = new Set<string>();
    const executeRetry = vi.fn(async () => ({ applied: true }));
    const onApplied = vi.fn();
    const onError = vi.fn();

    const result = await applyPendingGuidedSetupRetryViaStudio({
      agentId: "a1",
      source: "manual",
      retryBusyAgentId: busy.get(),
      inFlightAgentIds: inFlight,
      pendingSetupsByAgentId: { a1: {} as unknown as AgentGuidedSetup },
      setRetryBusyAgentId: setBusy,
      executeRetry,
      isDisconnectLikeError: () => false,
      resolveAgentName: (agentId) => agentId,
      onApplied,
      onError,
    });

    expect(result).toBe(true);
    expect(executeRetry).toHaveBeenCalledWith("a1");
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(inFlight.has("a1")).toBe(false);
    expect(busy.get()).toBe(null);
    expect(setBusy).toHaveBeenCalled();
  });
});

