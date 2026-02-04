import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AgentState } from "@/features/agents/state/store";
import { AgentBrainPanel } from "@/features/agents/components/AgentBrainPanel";

const createAgent = (agentId: string, name: string, sessionKey: string): AgentState => ({
  agentId,
  name,
  sessionKey,
  status: "idle",
  sessionCreated: true,
  awaitingUserInput: false,
  hasUnseenActivity: false,
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  sessionSettingsSynced: true,
  historyLoadedAt: null,
  toolCallingEnabled: true,
  showThinkingTraces: true,
  model: null,
  thinkingLevel: null,
  avatarSeed: `seed-${agentId}`,
  avatarUrl: null,
});

const mockFetch = () => {
  const filesBySession: Record<string, Record<string, string>> = {
    "session-1": { "AGENTS.md": "alpha agents" },
    "session-2": { "AGENTS.md": "beta agents" },
  };

  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      tool?: string;
      sessionKey?: string;
      args?: { path?: string; content?: string };
    };

    if (body.tool === "read") {
      const text =
        filesBySession[body.sessionKey ?? ""]?.[body.args?.path ?? ""] ?? "";
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, result: { text } }),
      } as Response;
    }

    return {
      ok: true,
      text: async () => JSON.stringify({ ok: true, result: { text: "" } }),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("AgentBrainPanel", () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders_selected_agent_file_tabs", async () => {
    const agents = [
      createAgent("agent-1", "Alpha", "session-1"),
      createAgent("agent-2", "Beta", "session-2"),
    ];

    render(
      createElement(AgentBrainPanel, {
        agents,
        selectedAgentId: "agent-1",
        onClose: vi.fn(),
      })
    );

    expect(screen.getByRole("button", { name: "AGENTS" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue("alpha agents")).toBeInTheDocument();
    });
  });

  it("shows_actionable_message_when_session_key_missing", async () => {
    const agents = [createAgent("agent-1", "Alpha", "")];

    render(
      createElement(AgentBrainPanel, {
        agents,
        selectedAgentId: "agent-1",
        onClose: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Session key is missing for this agent.")).toBeInTheDocument();
    });
  });
});
