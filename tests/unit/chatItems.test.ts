import { describe, expect, it } from "vitest";

import { buildAgentChatItems, buildFinalAgentChatItems } from "@/features/agents/components/chatItems";
import { formatThinkingMarkdown } from "@/lib/text/message-extract";

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
});
