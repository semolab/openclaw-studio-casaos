import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentTile as AgentTileType, TileSize } from "@/features/canvas/state/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  isTraceMarkdown,
  isToolMarkdown,
  parseToolMarkdown,
  stripTraceMarkdown,
} from "@/lib/text/message-extract";
import { normalizeAgentName } from "@/lib/names/agentNames";
import { Shuffle } from "lucide-react";
import { MAX_TILE_HEIGHT, MIN_TILE_SIZE } from "@/lib/canvasTileDefaults";
import { AgentAvatar } from "./AgentAvatar";

type AgentTileProps = {
  tile: AgentTileType;
  isSelected: boolean;
  canSend: boolean;
  onInspect: () => void;
  onNameChange: (name: string) => Promise<boolean>;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
  onAvatarShuffle: () => void;
  onNameShuffle: () => void;
  onResize?: (size: TileSize) => void;
  onResizeEnd?: (size: TileSize) => void;
};

export const AgentTile = ({
  tile,
  isSelected,
  canSend,
  onInspect,
  onNameChange,
  onDraftChange,
  onSend,
  onAvatarShuffle,
  onNameShuffle,
  onResize,
  onResizeEnd,
}: AgentTileProps) => {
  const [nameDraft, setNameDraft] = useState(tile.name);
  const [draftValue, setDraftValue] = useState(tile.draft);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const plainDraftRef = useRef(tile.draft);
  const resizeStateRef = useRef<{
    active: boolean;
    axis: "height" | "width";
    startX?: number;
    startY?: number;
    startWidth?: number;
    startHeight?: number;
  } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeSizeRef = useRef<TileSize>({
    width: tile.size.width,
    height: tile.size.height,
  });
  const resizeHandlersRef = useRef<{
    move: (event: PointerEvent) => void;
    stop: () => void;
  } | null>(null);

  const resizeDraft = useCallback(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
  }, []);

  const handleDraftRef = useCallback((el: HTMLTextAreaElement | HTMLInputElement | null) => {
    draftRef.current = el instanceof HTMLTextAreaElement ? el : null;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameDraft(tile.name);
  }, [tile.name]);

  useEffect(() => {
    if (tile.draft === plainDraftRef.current) return;
    plainDraftRef.current = tile.draft;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftValue(tile.draft);
  }, [tile.draft]);

  useEffect(() => {
    resizeDraft();
  }, [resizeDraft, tile.draft]);

  useEffect(() => {
    resizeSizeRef.current = {
      width: tile.size.width,
      height: tile.size.height,
    };
  }, [tile.size.height, tile.size.width]);

  const stopResize = useCallback(() => {
    if (!resizeStateRef.current?.active) return;
    resizeStateRef.current = null;
    if (resizeHandlersRef.current) {
      window.removeEventListener("pointermove", resizeHandlersRef.current.move);
      window.removeEventListener("pointerup", resizeHandlersRef.current.stop);
      window.removeEventListener("pointercancel", resizeHandlersRef.current.stop);
      resizeHandlersRef.current = null;
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
    if (onResizeEnd) {
      onResizeEnd(resizeSizeRef.current);
    }
  }, [onResizeEnd]);

  const scheduleResize = useCallback(
    (size: Partial<TileSize>) => {
      resizeSizeRef.current = {
        ...resizeSizeRef.current,
        ...size,
      };
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        onResize?.(resizeSizeRef.current);
      });
    },
    [onResize]
  );

  const startHeightResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onResize) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight = tile.size.height;
      resizeStateRef.current = {
        active: true,
        axis: "height",
        startY,
        startHeight,
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const move = (moveEvent: PointerEvent) => {
        if (!resizeStateRef.current?.active) return;
        const delta = moveEvent.clientY - startY;
        const nextHeight = Math.min(
          MAX_TILE_HEIGHT,
          Math.max(MIN_TILE_SIZE.height, startHeight + delta)
        );
        scheduleResize({ height: nextHeight });
      };
      const stop = () => {
        stopResize();
      };
      resizeHandlersRef.current = { move, stop };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [onResize, scheduleResize, stopResize, tile.size.height]
  );

  const startWidthResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onResize) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = tile.size.width;
      resizeStateRef.current = {
        active: true,
        axis: "width",
        startX,
        startWidth,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const move = (moveEvent: PointerEvent) => {
        if (!resizeStateRef.current?.active) return;
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(MIN_TILE_SIZE.width, startWidth + delta);
        scheduleResize({ width: nextWidth });
      };
      const stop = () => {
        stopResize();
      };
      resizeHandlersRef.current = { move, stop };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [onResize, scheduleResize, stopResize, tile.size.width]
  );

  useEffect(() => {
    return () => stopResize();
  }, [stopResize]);

  const commitName = async () => {
    const next = normalizeAgentName(nameDraft);
    if (!next) {
      setNameDraft(tile.name);
      return;
    }
    if (next === tile.name) {
      return;
    }
    const ok = await onNameChange(next);
    if (!ok) {
      setNameDraft(tile.name);
      return;
    }
    setNameDraft(next);
  };

  const statusColor =
    tile.status === "running"
      ? "bg-primary text-primary-foreground"
      : tile.status === "error"
        ? "bg-destructive text-destructive-foreground"
        : "bg-accent text-accent-foreground border border-border shadow-sm";
  const statusLabel =
    tile.status === "running"
      ? "Running"
      : tile.status === "error"
        ? "Error"
        : "Waiting for direction";

  const chatItems = useMemo(() => {
    const items: Array<
      | { kind: "user"; text: string }
      | { kind: "assistant"; text: string; live?: boolean }
      | { kind: "trace"; text: string; live?: boolean }
      | { kind: "tool"; text: string }
    > = [];
    for (const line of tile.outputLines) {
      if (!line) continue;
      if (isTraceMarkdown(line)) {
        if (!tile.showThinkingTraces) continue;
        const text = stripTraceMarkdown(line).trim();
        if (text) items.push({ kind: "trace", text });
        continue;
      }
      if (isToolMarkdown(line)) {
        if (!tile.toolCallingEnabled) continue;
        items.push({ kind: "tool", text: line });
        continue;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith(">")) {
        const text = trimmed.replace(/^>\s?/, "").trim();
        if (text) items.push({ kind: "user", text });
        continue;
      }
      items.push({ kind: "assistant", text: line });
    }
    const liveThinking = tile.thinkingTrace?.trim();
    if (tile.showThinkingTraces && liveThinking) {
      items.push({ kind: "trace", text: liveThinking, live: true });
    }
    const liveStream = tile.streamText?.trim();
    if (liveStream) {
      items.push({ kind: "assistant", text: liveStream, live: true });
    }
    return items;
  }, [
    tile.outputLines,
    tile.showThinkingTraces,
    tile.streamText,
    tile.thinkingTrace,
    tile.toolCallingEnabled,
  ]);

  const avatarSeed = tile.avatarSeed ?? tile.agentId;
  const resizeHandleClass = isSelected
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100";

  return (
    <div data-tile className="group relative flex h-full w-full flex-col">
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="relative">
              <div data-drag-handle>
                <AgentAvatar
                  seed={avatarSeed}
                  name={tile.name}
                  avatarUrl={tile.avatarUrl ?? null}
                  size={96}
                  isSelected={isSelected}
                />
              </div>
              <button
                className="nodrag absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm hover:bg-card"
                type="button"
                aria-label="Shuffle avatar"
                data-testid="agent-avatar-shuffle"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAvatarShuffle();
                }}
              >
                <Shuffle className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div
                className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-1 shadow-sm ${
                  isSelected ? "agent-name-selected" : "border-border"
                }`}
              >
                <input
                  className="w-full bg-transparent text-center text-xs font-semibold uppercase tracking-wide text-foreground outline-none"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => {
                    void commitName();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setNameDraft(tile.name);
                      event.currentTarget.blur();
                    }
                  }}
                />
                <button
                  className="nodrag flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-card"
                  type="button"
                  aria-label="Shuffle name"
                  data-testid="agent-name-shuffle"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onNameShuffle();
                  }}
                >
                  <Shuffle className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}
                >
                  {statusLabel}
                </span>
                <button
                  className="nodrag rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-card"
                  type="button"
                  data-testid="agent-inspect-toggle"
                  onClick={onInspect}
                >
                  Inspect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
        <div
          ref={chatRef}
          className="flex-1 overflow-auto rounded-lg border border-border bg-card p-3"
          onWheel={(event) => {
            event.stopPropagation();
          }}
          onWheelCapture={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="flex flex-col gap-3 text-xs text-foreground">
            {chatItems.length === 0 ? (
              <div className="text-xs text-muted-foreground">No messages yet.</div>
            ) : (
              chatItems.map((item, index) => {
                if (item.kind === "user") {
                  return (
                    <div
                      key={`chat-${tile.agentId}-user-${index}`}
                      className="rounded-md bg-muted/70 px-3 py-2 text-foreground"
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {`> ${item.text}`}
                      </ReactMarkdown>
                    </div>
                  );
                }
                if (item.kind === "trace") {
                  return (
                    <details
                      key={`chat-${tile.agentId}-trace-${index}`}
                      className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
                      open={Boolean(item.live)}
                    >
                      <summary className="cursor-pointer select-none font-semibold">
                        Thinking trace
                      </summary>
                      <div className="agent-markdown mt-1 text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {item.text}
                        </ReactMarkdown>
                      </div>
                    </details>
                  );
                }
                if (item.kind === "tool") {
                  const parsed = parseToolMarkdown(item.text);
                  const summaryLabel =
                    parsed.kind === "result" ? "Tool result" : "Tool call";
                  const summaryText = parsed.label
                    ? `${summaryLabel}: ${parsed.label}`
                    : summaryLabel;
                  return (
                    <details
                      key={`chat-${tile.agentId}-tool-${index}`}
                      className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      <summary className="cursor-pointer select-none font-semibold">
                        {summaryText}
                      </summary>
                      {parsed.body ? (
                        <div className="agent-markdown mt-1 text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {parsed.body}
                          </ReactMarkdown>
                        </div>
                      ) : null}
                    </details>
                  );
                }
                return (
                  <div
                    key={`chat-${tile.agentId}-assistant-${index}`}
                    className={`agent-markdown ${
                      item.live ? "opacity-80" : ""
                    }`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {item.text}
                    </ReactMarkdown>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={handleDraftRef}
            rows={1}
            value={draftValue}
            className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-foreground outline-none"
            onChange={(event) => {
              const value = event.target.value;
              plainDraftRef.current = value;
              setDraftValue(value);
              onDraftChange(value);
              resizeDraft();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.defaultPrevented) return;
              event.preventDefault();
              if (!canSend || tile.status === "running") return;
              const message = draftValue.trim();
              if (!message) return;
              onSend(message);
            }}
            placeholder="type a message"
          />
          <button
            className="rounded-lg border border-transparent bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            type="button"
            onClick={() => onSend(draftValue)}
            disabled={!canSend || tile.status === "running" || !draftValue.trim()}
          >
            Send
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Resize tile"
        className={`nodrag absolute -bottom-2 left-6 right-6 flex h-4 cursor-row-resize touch-none items-center justify-center transition-opacity ${resizeHandleClass}`}
        onPointerDown={startHeightResize}
      >
        <span className="h-1.5 w-16 rounded-full bg-border shadow-sm" />
      </button>
      <button
        type="button"
        aria-label="Resize tile width"
        className={`nodrag absolute -right-2 top-6 bottom-6 flex w-4 cursor-col-resize touch-none items-center justify-center transition-opacity ${resizeHandleClass}`}
        onPointerDown={startWidthResize}
      >
        <span className="h-16 w-1.5 rounded-full bg-border shadow-sm" />
      </button>
    </div>
  );
};
