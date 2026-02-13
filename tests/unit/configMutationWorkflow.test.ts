import { describe, expect, it, vi } from "vitest";
import {
  buildConfigMutationFailureMessage,
  runConfigMutationWorkflow,
  type MutationWorkflowKind,
} from "@/features/agents/operations/configMutationWorkflow";

describe("configMutationWorkflow", () => {
  it("returns completed for local gateway mutations without restart wait", async () => {
    const executeMutation = vi.fn(async () => undefined);
    const shouldAwaitRemoteRestart = vi.fn(async () => true);

    const result = await runConfigMutationWorkflow(
      { kind: "delete-agent", isLocalGateway: true },
      { executeMutation, shouldAwaitRemoteRestart }
    );

    expect(result).toEqual({ disposition: "completed" });
    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(shouldAwaitRemoteRestart).not.toHaveBeenCalled();
  });

  it("returns completed for remote mutation when restart wait is not required", async () => {
    const executeMutation = vi.fn(async () => undefined);
    const shouldAwaitRemoteRestart = vi.fn(async () => false);

    const result = await runConfigMutationWorkflow(
      { kind: "rename-agent", isLocalGateway: false },
      { executeMutation, shouldAwaitRemoteRestart }
    );

    expect(result).toEqual({ disposition: "completed" });
    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(shouldAwaitRemoteRestart).toHaveBeenCalledTimes(1);
  });

  it("returns awaiting-restart for remote mutation when restart wait is required", async () => {
    const executeMutation = vi.fn(async () => undefined);
    const shouldAwaitRemoteRestart = vi.fn(async () => true);

    const result = await runConfigMutationWorkflow(
      { kind: "delete-agent", isLocalGateway: false },
      { executeMutation, shouldAwaitRemoteRestart }
    );

    expect(result).toEqual({ disposition: "awaiting-restart" });
    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(shouldAwaitRemoteRestart).toHaveBeenCalledTimes(1);
  });

  it("maps mutation failures to user-facing errors", () => {
    const fallbackByKind: Record<MutationWorkflowKind, string> = {
      "rename-agent": "Failed to rename agent.",
      "delete-agent": "Failed to delete agent.",
    };
    for (const [kind, fallback] of Object.entries(fallbackByKind) as Array<
      [MutationWorkflowKind, string]
    >) {
      expect(buildConfigMutationFailureMessage({ kind, error: new Error("boom") })).toBe("boom");
      expect(buildConfigMutationFailureMessage({ kind, error: 123 })).toBe(fallback);
    }
  });

  it("rejects invalid mutation input before side effects", async () => {
    const executeMutation = vi.fn(async () => undefined);
    const shouldAwaitRemoteRestart = vi.fn(async () => true);

    await expect(
      runConfigMutationWorkflow(
        // @ts-expect-error intentional invalid kind check
        { kind: "unknown-kind", isLocalGateway: false },
        { executeMutation, shouldAwaitRemoteRestart }
      )
    ).rejects.toThrow("Unknown config mutation kind: unknown-kind");

    expect(executeMutation).not.toHaveBeenCalled();
    expect(shouldAwaitRemoteRestart).not.toHaveBeenCalled();
  });
});
