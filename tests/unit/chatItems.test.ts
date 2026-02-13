import { describe, expect, it } from "vitest";

import { buildAgentChatItems, buildFinalAgentChatItems, summarizeToolLabel } from "@/features/agents/components/chatItems";
import { formatMetaMarkdown, formatThinkingMarkdown, formatToolCallMarkdown, formatToolResultMarkdown } from "@/lib/text/message-extract";

describe("buildAgentChatItems", () => {
  it("keeps thinking traces aligned with each assistant turn", () => {
    const items = buildAgentChatItems({
      outputLines: [
        "> first question",
        formatThinkingMarkdown("first plan"),
        "first answer",
        "> second question",
        formatThinkingMarkdown("second plan"),
        "second answer",
      ],
      streamText: null,
      liveThinkingTrace: "",
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items.map((item) => item.kind)).toEqual([
      "user",
      "thinking",
      "assistant",
      "user",
      "thinking",
      "assistant",
    ]);
    expect(items[1]).toMatchObject({ kind: "thinking", text: "_first plan_" });
    expect(items[4]).toMatchObject({ kind: "thinking", text: "_second plan_" });
  });

  it("does not include saved traces when thinking traces are disabled", () => {
    const items = buildAgentChatItems({
      outputLines: [
        "> first question",
        formatThinkingMarkdown("first plan"),
        "first answer",
      ],
      streamText: null,
      liveThinkingTrace: "live plan",
      showThinkingTraces: false,
      toolCallingEnabled: true,
    });

    expect(items.map((item) => item.kind)).toEqual(["user", "assistant"]);
  });

  it("adds a live trace before the live assistant stream", () => {
    const items = buildAgentChatItems({
      outputLines: ["first answer"],
      streamText: "stream answer",
      liveThinkingTrace: "first plan",
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items.map((item) => item.kind)).toEqual(["assistant", "thinking", "assistant"]);
    expect(items[1]).toMatchObject({ kind: "thinking", text: "_first plan_", live: true });
  });

  it("merges adjacent thinking traces into a single item", () => {
    const items = buildAgentChatItems({
      outputLines: [formatThinkingMarkdown("first plan"), formatThinkingMarkdown("second plan"), "answer"],
      streamText: null,
      liveThinkingTrace: "",
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items.map((item) => item.kind)).toEqual(["thinking", "assistant"]);
    expect(items[0]).toMatchObject({
      kind: "thinking",
      text: "_first plan_\n\n_second plan_",
    });
  });
});

describe("buildFinalAgentChatItems", () => {
  it("does not include live thinking or live assistant items", () => {
    const items = buildFinalAgentChatItems({
      outputLines: ["> question", formatThinkingMarkdown("plan"), "answer"],
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items.map((item) => item.kind)).toEqual(["user", "thinking", "assistant"]);
  });

  it("propagates meta timestamps and thinking duration into subsequent items", () => {
    const items = buildFinalAgentChatItems({
      outputLines: [
        formatMetaMarkdown({ role: "user", timestamp: 1700000000000 }),
        "> hello",
        formatMetaMarkdown({ role: "assistant", timestamp: 1700000001234, thinkingDurationMs: 1800 }),
        formatThinkingMarkdown("plan"),
        "answer",
      ],
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items[0]).toMatchObject({ kind: "user", text: "hello", timestampMs: 1700000000000 });
    expect(items[1]).toMatchObject({
      kind: "thinking",
      text: "_plan_",
      timestampMs: 1700000001234,
      thinkingDurationMs: 1800,
    });
    expect(items[2]).toMatchObject({
      kind: "assistant",
      text: "answer",
      timestampMs: 1700000001234,
      thinkingDurationMs: 1800,
    });
  });

  it("collapses adjacent duplicate user items when optimistic and persisted turns match", () => {
    const items = buildFinalAgentChatItems({
      outputLines: [
        "> hello\n\nworld",
        formatMetaMarkdown({ role: "user", timestamp: 1700000000000 }),
        "> hello world",
      ],
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items).toEqual([
      {
        kind: "user",
        text: "hello world",
        timestampMs: 1700000000000,
      },
    ]);
  });

  it("does_not_collapse_repeated_user_message_when_second_turn_is_only_optimistic", () => {
    const items = buildFinalAgentChatItems({
      outputLines: [
        formatMetaMarkdown({ role: "user", timestamp: 1700000000000 }),
        "> repeat",
        "> repeat",
      ],
      showThinkingTraces: true,
      toolCallingEnabled: true,
    });

    expect(items).toEqual([
      {
        kind: "user",
        text: "repeat",
        timestampMs: 1700000000000,
      },
      {
        kind: "user",
        text: "repeat",
      },
    ]);
  });
});

describe("summarizeToolLabel", () => {
  it("hides long tool call ids and prefers showing the command/path/url value", () => {
    const toolCallLine = formatToolCallMarkdown({
      id: "call_ABC123|fc_456",
      name: "functions.exec",
      arguments: { command: "gh auth status" },
    });

    const { summaryText: callSummary } = summarizeToolLabel(toolCallLine);
    expect(callSummary).toContain("gh auth status");
    expect(callSummary).not.toContain("call_");

    const toolResultLine = formatToolResultMarkdown({
      toolCallId: "call_ABC123|fc_456",
      toolName: "functions.exec",
      details: { status: "completed", exitCode: 0, durationMs: 168 },
      isError: false,
      text: "ok",
    });

    const { summaryText: resultSummary } = summarizeToolLabel(toolResultLine);
    expect(resultSummary).toContain("completed");
    expect(resultSummary).toContain("exit 0");
    expect(resultSummary).not.toContain("call_");
  });
});
