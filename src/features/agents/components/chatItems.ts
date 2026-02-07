import {
  formatThinkingMarkdown,
  isToolMarkdown,
  isTraceMarkdown,
  parseToolMarkdown,
  stripTraceMarkdown,
} from "@/lib/text/message-extract";

export type AgentChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; live?: boolean }
  | { kind: "tool"; text: string }
  | { kind: "thinking"; text: string; live?: boolean };

export type BuildAgentChatItemsInput = {
  outputLines: string[];
  streamText: string | null;
  liveThinkingTrace: string;
  showThinkingTraces: boolean;
  toolCallingEnabled: boolean;
};

export const normalizeAssistantDisplayText = (value: string): string => {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let lastWasBlank = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/g, "");
    if (line.trim().length === 0) {
      if (lastWasBlank) continue;
      normalized.push("");
      lastWasBlank = true;
      continue;
    }
    normalized.push(line);
    lastWasBlank = false;
  }
  return normalized.join("\n").trim();
};

const normalizeThinkingDisplayText = (value: string): string => {
  const markdown = formatThinkingMarkdown(value);
  const normalized = stripTraceMarkdown(markdown).trim();
  return normalized;
};

export const buildFinalAgentChatItems = ({
  outputLines,
  showThinkingTraces,
  toolCallingEnabled,
}: Pick<
  BuildAgentChatItemsInput,
  "outputLines" | "showThinkingTraces" | "toolCallingEnabled"
>): AgentChatItem[] => {
  const items: AgentChatItem[] = [];
  const appendThinking = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    const previous = items[items.length - 1];
    if (!previous || previous.kind !== "thinking") {
      items.push({ kind: "thinking", text: normalized });
      return;
    }
    if (previous.text === normalized) {
      return;
    }
    if (normalized.startsWith(previous.text)) {
      previous.text = normalized;
      return;
    }
    if (previous.text.startsWith(normalized)) {
      return;
    }
    previous.text = `${previous.text}\n\n${normalized}`;
  };

  for (const line of outputLines) {
    if (!line) continue;
    if (isTraceMarkdown(line)) {
      if (!showThinkingTraces) continue;
      const text = stripTraceMarkdown(line).trim();
      if (!text) continue;
      appendThinking(text);
      continue;
    }
    if (isToolMarkdown(line)) {
      if (!toolCallingEnabled) continue;
      items.push({ kind: "tool", text: line });
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) {
      const text = trimmed.replace(/^>\s?/, "").trim();
      if (text) items.push({ kind: "user", text });
      continue;
    }
    const normalizedAssistant = normalizeAssistantDisplayText(line);
    if (!normalizedAssistant) continue;
    items.push({ kind: "assistant", text: normalizedAssistant });
  }

  return items;
};

export const buildAgentChatItems = ({
  outputLines,
  streamText,
  liveThinkingTrace,
  showThinkingTraces,
  toolCallingEnabled,
}: BuildAgentChatItemsInput): AgentChatItem[] => {
  const items: AgentChatItem[] = [];
  const appendThinking = (text: string, live?: boolean) => {
    const normalized = text.trim();
    if (!normalized) return;
    const previous = items[items.length - 1];
    if (!previous || previous.kind !== "thinking") {
      items.push({ kind: "thinking", text: normalized, live });
      return;
    }
    if (previous.text === normalized) {
      if (live) previous.live = true;
      return;
    }
    if (normalized.startsWith(previous.text)) {
      previous.text = normalized;
      if (live) previous.live = true;
      return;
    }
    if (previous.text.startsWith(normalized)) {
      if (live) previous.live = true;
      return;
    }
    previous.text = `${previous.text}\n\n${normalized}`;
    if (live) previous.live = true;
  };

  for (const line of outputLines) {
    if (!line) continue;
    if (isTraceMarkdown(line)) {
      if (!showThinkingTraces) continue;
      const text = stripTraceMarkdown(line).trim();
      if (!text) continue;
      appendThinking(text);
      continue;
    }
    if (isToolMarkdown(line)) {
      if (!toolCallingEnabled) continue;
      items.push({ kind: "tool", text: line });
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) {
      const text = trimmed.replace(/^>\s?/, "").trim();
      if (text) items.push({ kind: "user", text });
      continue;
    }
    const normalizedAssistant = normalizeAssistantDisplayText(line);
    if (!normalizedAssistant) continue;
    items.push({ kind: "assistant", text: normalizedAssistant });
  }

  if (showThinkingTraces) {
    const normalizedLiveThinking = normalizeThinkingDisplayText(liveThinkingTrace);
    if (normalizedLiveThinking) {
      appendThinking(normalizedLiveThinking, true);
    }
  }

  const liveStream = streamText?.trim();
  if (liveStream) {
    const normalizedStream = normalizeAssistantDisplayText(liveStream);
    if (normalizedStream) {
      items.push({ kind: "assistant", text: normalizedStream, live: true });
    }
  }

  return items;
};

export const summarizeToolLabel = (line: string): { summaryText: string; body: string } => {
  const parsed = parseToolMarkdown(line);
  const summaryLabel = parsed.kind === "result" ? "Tool result" : "Tool call";
  const summaryText = parsed.label ? `${summaryLabel}: ${parsed.label}` : summaryLabel;
  return {
    summaryText,
    body: parsed.body,
  };
};
