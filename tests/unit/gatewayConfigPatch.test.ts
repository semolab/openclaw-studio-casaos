import { describe, expect, it, vi } from "vitest";

import {
  createGatewayAgent,
  deleteGatewayAgent,
  renameGatewayAgent,
  resolveHeartbeatSettings,
  removeGatewayHeartbeatOverride,
  updateGatewayHeartbeat,
} from "@/lib/gateway/agentConfig";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

describe("gateway config patch helpers", () => {
  it("creates a new agent in the config patch", async () => {
    const client = {
      call: vi.fn(async (method: string) => {
        if (method === "config.get") {
          return {
            exists: true,
            hash: "hash-create-1",
            config: {
              agents: { list: [{ id: "agent-1", name: "Agent One" }] },
            },
          };
        }
        if (method === "config.patch") {
          return { ok: true };
        }
        throw new Error("unexpected method");
      }),
    } as unknown as GatewayClient;

    const entry = await createGatewayAgent({ client, name: "New Agent" });
    expect(entry.id).toBe("new-agent");
    expect(entry.name).toBe("New Agent");

    const patchCall = (client.call as ReturnType<typeof vi.fn>).mock.calls.find(
      ([method]) => method === "config.patch"
    );
    expect(patchCall).toBeTruthy();
    const params = patchCall?.[1] as { raw?: string; baseHash?: string };
    const raw = params?.raw ?? "";
    const parsed = JSON.parse(raw) as { agents?: { list?: Array<{ id?: string; name?: string }> } };
    const appended = parsed.agents?.list?.find((item) => item.id === "new-agent");
    expect(params.baseHash).toBe("hash-create-1");
    expect(appended).toEqual({ id: "new-agent", name: "New Agent" });
  });

  it("creates unique ids when base id already exists", async () => {
    const client = {
      call: vi.fn(async (method: string) => {
        if (method === "config.get") {
          return {
            exists: true,
            hash: "hash-create-2",
            config: {
              agents: {
                list: [
                  { id: "new-agent", name: "New Agent" },
                  { id: "new-agent-2", name: "New Agent 2" },
                ],
              },
            },
          };
        }
        if (method === "config.patch") {
          return { ok: true };
        }
        throw new Error("unexpected method");
      }),
    } as unknown as GatewayClient;

    const entry = await createGatewayAgent({ client, name: "New Agent" });
    expect(entry.id).toBe("new-agent-3");
  });

  it("returns no-op on deleting a missing agent and skips config.patch", async () => {
    const client = {
      call: vi.fn(async (method: string) => {
        if (method === "config.get") {
            return {
            exists: true,
            hash: "hash-del-1",
            config: {
              agents: { list: [{ id: "agent-1", name: "Agent One" }] },
              bindings: [{ agentId: "agent-3", channel: "x" }],
            },
          };
        }
        if (method === "config.patch") {
          throw new Error("config.patch should not be called");
        }
        throw new Error("unexpected method");
      }),
    } as unknown as GatewayClient;

    const result = await deleteGatewayAgent({
      client,
      agentId: "agent-2",
    });

    expect(result).toEqual({ removed: false, removedBindings: 0 });
    expect(client.call).toHaveBeenCalledTimes(1);
    expect((client.call as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("config.get");
  });

  it("fails fast on empty create name", async () => {
    const client = {
      call: vi.fn(),
    } as unknown as GatewayClient;

    await expect(createGatewayAgent({ client, name: "   " })).rejects.toThrow(
      "Agent name is required."
    );
    expect(client.call).not.toHaveBeenCalled();
  });

  it("returns current settings when no heartbeat override exists to remove", async () => {
    const client = {
      call: vi.fn(async (method: string) => {
        if (method === "config.get") {
          return {
            exists: true,
            hash: "hash-remove-1",
            config: {
              agents: {
                defaults: {
                  heartbeat: {
                    every: "10m",
                    target: "last",
                    includeReasoning: false,
                    ackMaxChars: 300,
                  },
                },
                list: [{ id: "agent-1", name: "Agent One" }],
              },
            },
          };
        }
        if (method === "config.patch") {
          throw new Error("config.patch should not be called");
        }
        throw new Error("unexpected method");
      }),
    } as unknown as GatewayClient;

    const result = await removeGatewayHeartbeatOverride({
      client,
      agentId: "agent-1",
    });

    expect(result).toEqual({
      heartbeat: {
        every: "10m",
        target: "last",
        includeReasoning: false,
        ackMaxChars: 300,
        activeHours: null,
      },
      hasOverride: false,
    });
    expect(client.call).toHaveBeenCalledTimes(1);
  });

  it("renames an agent in the config patch", async () => {
    const client = {
      call: vi.fn(async (method: string) => {
        if (method === "config.get") {
          return {
            exists: true,
            hash: "hash-1",
            config: {
              agents: { list: [{ id: "agent-1", name: "Old Name" }] },
            },
          };
        }
        if (method === "config.patch") {
          return { ok: true };
        }
        throw new Error("unexpected method");
      }),
    } as unknown as GatewayClient;

    await renameGatewayAgent({ client, agentId: "agent-1", name: "New Name" });

    const patchCall = (client.call as ReturnType<typeof vi.fn>).mock.calls.find(
      ([method]) => method === "config.patch"
    );
    expect(patchCall).toBeTruthy();
    const params = patchCall?.[1] as { raw?: string; baseHash?: string };
    const raw = params?.raw ?? "";
    const parsed = JSON.parse(raw) as { agents?: { list?: Array<{ name?: string }> } };
    expect(params.baseHash).toBe("hash-1");
    expect(parsed.agents?.list?.[0]?.name).toBe("New Name");
  });

  it("resolves heartbeat defaults and overrides", () => {
    const config = {
      agents: {
        defaults: {
          heartbeat: {
            every: "2h",
            target: "last",
            includeReasoning: false,
            ackMaxChars: 200,
          },
        },
        list: [
          {
            id: "agent-1",
            heartbeat: { every: "30m", target: "none", includeReasoning: true },
          },
        ],
      },
    };
    const result = resolveHeartbeatSettings(config, "agent-1");
    expect(result.heartbeat.every).toBe("30m");
    expect(result.heartbeat.target).toBe("none");
    expect(result.heartbeat.includeReasoning).toBe(true);
    expect(result.hasOverride).toBe(true);
  });

  it("updates heartbeat overrides via config.patch", async () => {
    const client = {
      call: vi.fn(async (method: string) => {
        if (method === "config.get") {
          return {
            exists: true,
            hash: "hash-2",
            config: {
              agents: {
                defaults: {
                  heartbeat: {
                    every: "1h",
                    target: "last",
                    includeReasoning: false,
                    ackMaxChars: 300,
                  },
                },
                list: [{ id: "agent-1" }],
              },
            },
          };
        }
        if (method === "config.patch") {
          return { ok: true };
        }
        throw new Error("unexpected method");
      }),
    } as unknown as GatewayClient;

    const result = await updateGatewayHeartbeat({
      client,
      agentId: "agent-1",
      payload: {
        override: true,
        heartbeat: {
          every: "15m",
          target: "none",
          includeReasoning: true,
          ackMaxChars: 120,
          activeHours: { start: "08:00", end: "18:00" },
        },
      },
    });

    expect(result.heartbeat.every).toBe("15m");
    expect(result.heartbeat.target).toBe("none");
    expect(result.heartbeat.includeReasoning).toBe(true);
    expect(result.hasOverride).toBe(true);
  });
});
