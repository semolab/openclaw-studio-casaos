"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentState } from "@/features/agents/state/store";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import {
  resolveHeartbeatSettings,
  updateGatewayHeartbeat,
  type GatewayConfigSnapshot,
} from "@/lib/gateway/agentConfig";
import { invokeGatewayTool } from "@/lib/gateway/tools";
import type { GatewayModelChoice } from "@/lib/gateway/models";
import {
  createAgentFilesState,
  isAgentFileName,
  AGENT_FILE_META,
  AGENT_FILE_NAMES,
  AGENT_FILE_PLACEHOLDERS,
  type AgentFileName,
} from "@/lib/agents/agentFiles";

const HEARTBEAT_INTERVAL_OPTIONS = ["15m", "30m", "1h", "2h", "6h", "12h", "24h"];

type AgentInspectPanelProps = {
  agent: AgentState;
  client: GatewayClient;
  models: GatewayModelChoice[];
  onClose: () => void;
  onDelete: () => void;
  onModelChange: (value: string | null) => void;
  onThinkingChange: (value: string | null) => void;
  onToolCallingToggle: (enabled: boolean) => void;
  onThinkingTracesToggle: (enabled: boolean) => void;
};

export const AgentInspectPanel = ({
  agent,
  client,
  models,
  onClose,
  onDelete,
  onModelChange,
  onThinkingChange,
  onToolCallingToggle,
  onThinkingTracesToggle,
}: AgentInspectPanelProps) => {
  const [agentFiles, setAgentFiles] = useState(createAgentFilesState);
  const [agentFileTab, setAgentFileTab] = useState<AgentFileName>(
    AGENT_FILE_NAMES[0]
  );
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [agentFilesSaving, setAgentFilesSaving] = useState(false);
  const [agentFilesDirty, setAgentFilesDirty] = useState(false);
  const [agentFilesError, setAgentFilesError] = useState<string | null>(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [heartbeatSaving, setHeartbeatSaving] = useState(false);
  const [heartbeatDirty, setHeartbeatDirty] = useState(false);
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null);
  const [heartbeatOverride, setHeartbeatOverride] = useState(false);
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true);
  const [heartbeatEvery, setHeartbeatEvery] = useState("30m");
  const [heartbeatIntervalMode, setHeartbeatIntervalMode] = useState<
    "preset" | "custom"
  >("preset");
  const [heartbeatCustomMinutes, setHeartbeatCustomMinutes] = useState("45");
  const [heartbeatTargetMode, setHeartbeatTargetMode] = useState<
    "last" | "none" | "custom"
  >("last");
  const [heartbeatTargetCustom, setHeartbeatTargetCustom] = useState("");
  const [heartbeatIncludeReasoning, setHeartbeatIncludeReasoning] = useState(false);
  const [heartbeatActiveHoursEnabled, setHeartbeatActiveHoursEnabled] =
    useState(false);
  const [heartbeatActiveStart, setHeartbeatActiveStart] = useState("08:00");
  const [heartbeatActiveEnd, setHeartbeatActiveEnd] = useState("18:00");
  const [heartbeatAckMaxChars, setHeartbeatAckMaxChars] = useState("300");
  const extractToolText = useCallback((result: unknown) => {
    if (!result || typeof result !== "object") return "";
    const record = result as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    const content = record.content;
    if (!Array.isArray(content)) return "";
    const blocks = content
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const block = item as Record<string, unknown>;
        if (block.type !== "text" || typeof block.text !== "string") return null;
        return block.text;
      })
      .filter((text): text is string => Boolean(text));
    return blocks.join("");
  }, []);

  const isMissingFileError = useCallback(
    (message: string) => /no such file|enoent/i.test(message),
    []
  );

  const loadAgentFiles = useCallback(async () => {
    setAgentFilesLoading(true);
    setAgentFilesError(null);
    try {
      const sessionKey = agent.sessionKey?.trim();
      if (!sessionKey) {
        setAgentFilesError("Session key is missing for this agent.");
        return;
      }
      const results = await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const response = await invokeGatewayTool({
            tool: "read",
            sessionKey,
            args: { path: name },
          });
          if (!response.ok) {
            if (isMissingFileError(response.error)) {
              return { name, content: "", exists: false };
            }
            throw new Error(response.error);
          }
          const content = extractToolText(response.result);
          return { name, content, exists: true };
        })
      );
      const nextState = createAgentFilesState();
      for (const file of results) {
        if (!isAgentFileName(file.name)) continue;
        nextState[file.name] = {
          content: file.content ?? "",
          exists: Boolean(file.exists),
        };
      }
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load agent files.";
      setAgentFilesError(message);
    } finally {
      setAgentFilesLoading(false);
    }
  }, [extractToolText, isMissingFileError, agent.sessionKey]);

  const saveAgentFiles = useCallback(async () => {
    setAgentFilesSaving(true);
    setAgentFilesError(null);
    try {
      const sessionKey = agent.sessionKey?.trim();
      if (!sessionKey) {
        setAgentFilesError("Session key is missing for this agent.");
        return;
      }
      await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const response = await invokeGatewayTool({
            tool: "write",
            sessionKey,
            args: { path: name, content: agentFiles[name].content },
          });
          if (!response.ok) {
            throw new Error(response.error);
          }
          return name;
        })
      );
      const nextState = createAgentFilesState();
      for (const name of AGENT_FILE_NAMES) {
        nextState[name] = {
          content: agentFiles[name].content,
          exists: true,
        };
      }
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save agent files.";
      setAgentFilesError(message);
    } finally {
      setAgentFilesSaving(false);
    }
  }, [agent.sessionKey, agentFiles]);

  const handleAgentFileTabChange = useCallback(
    (nextTab: AgentFileName) => {
      if (nextTab === agentFileTab) return;
      if (agentFilesDirty && !agentFilesSaving) {
        void saveAgentFiles();
      }
      setAgentFileTab(nextTab);
    },
    [saveAgentFiles, agentFilesDirty, agentFilesSaving, agentFileTab]
  );

  const loadHeartbeat = useCallback(async () => {
    setHeartbeatLoading(true);
    setHeartbeatError(null);
    try {
      const snapshot = await client.call<GatewayConfigSnapshot>("config.get", {});
      const config =
        snapshot.config && typeof snapshot.config === "object" ? snapshot.config : {};
      const result = resolveHeartbeatSettings(config, agent.agentId);
      const every = result.heartbeat.every ?? "30m";
      const enabled = every !== "0m";
      const isPreset = HEARTBEAT_INTERVAL_OPTIONS.includes(every);
      if (isPreset) {
        setHeartbeatIntervalMode("preset");
      } else {
        setHeartbeatIntervalMode("custom");
        const parsed =
          every.endsWith("m")
            ? Number.parseInt(every, 10)
            : every.endsWith("h")
              ? Number.parseInt(every, 10) * 60
              : Number.parseInt(every, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          setHeartbeatCustomMinutes(String(parsed));
        }
      }
      const target = result.heartbeat.target ?? "last";
      const targetMode = target === "last" || target === "none" ? target : "custom";
      setHeartbeatOverride(result.hasOverride);
      setHeartbeatEnabled(enabled);
      setHeartbeatEvery(enabled ? every : "30m");
      setHeartbeatTargetMode(targetMode);
      setHeartbeatTargetCustom(targetMode === "custom" ? target : "");
      setHeartbeatIncludeReasoning(Boolean(result.heartbeat.includeReasoning));
      if (result.heartbeat.activeHours) {
        setHeartbeatActiveHoursEnabled(true);
        setHeartbeatActiveStart(result.heartbeat.activeHours.start);
        setHeartbeatActiveEnd(result.heartbeat.activeHours.end);
      } else {
        setHeartbeatActiveHoursEnabled(false);
      }
      if (typeof result.heartbeat.ackMaxChars === "number") {
        setHeartbeatAckMaxChars(String(result.heartbeat.ackMaxChars));
      } else {
        setHeartbeatAckMaxChars("300");
      }
      setHeartbeatDirty(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load heartbeat settings.";
      setHeartbeatError(message);
    } finally {
      setHeartbeatLoading(false);
    }
  }, [client, agent.agentId]);

  const saveHeartbeat = useCallback(async () => {
    setHeartbeatSaving(true);
    setHeartbeatError(null);
    try {
      const target =
        heartbeatTargetMode === "custom"
          ? heartbeatTargetCustom.trim()
          : heartbeatTargetMode;
      let every = heartbeatEnabled ? heartbeatEvery.trim() : "0m";
      if (heartbeatEnabled && heartbeatIntervalMode === "custom") {
        const customValue = Number.parseInt(heartbeatCustomMinutes, 10);
        if (!Number.isFinite(customValue) || customValue <= 0) {
          setHeartbeatError("Custom interval must be a positive number.");
          setHeartbeatSaving(false);
          return;
        }
        every = `${customValue}m`;
      }
      const ackParsed = Number.parseInt(heartbeatAckMaxChars, 10);
      const ackMaxChars = Number.isFinite(ackParsed) ? ackParsed : 300;
      const activeHours =
        heartbeatActiveHoursEnabled && heartbeatActiveStart && heartbeatActiveEnd
          ? { start: heartbeatActiveStart, end: heartbeatActiveEnd }
          : null;
      const result = await updateGatewayHeartbeat({
        client,
        agentId: agent.agentId,
        sessionKey: agent.sessionKey,
        payload: {
          override: heartbeatOverride,
          heartbeat: {
            every,
            target: target || "last",
            includeReasoning: heartbeatIncludeReasoning,
            ackMaxChars,
            activeHours,
          },
        },
      });
      setHeartbeatOverride(result.hasOverride);
      setHeartbeatEnabled(result.heartbeat.every !== "0m");
      setHeartbeatEvery(result.heartbeat.every);
      setHeartbeatTargetMode(
        result.heartbeat.target === "last" || result.heartbeat.target === "none"
          ? result.heartbeat.target
          : "custom"
      );
      setHeartbeatTargetCustom(
        result.heartbeat.target === "last" || result.heartbeat.target === "none"
          ? ""
          : result.heartbeat.target
      );
      setHeartbeatIncludeReasoning(result.heartbeat.includeReasoning);
      if (result.heartbeat.activeHours) {
        setHeartbeatActiveHoursEnabled(true);
        setHeartbeatActiveStart(result.heartbeat.activeHours.start);
        setHeartbeatActiveEnd(result.heartbeat.activeHours.end);
      } else {
        setHeartbeatActiveHoursEnabled(false);
      }
      if (typeof result.heartbeat.ackMaxChars === "number") {
        setHeartbeatAckMaxChars(String(result.heartbeat.ackMaxChars));
      } else {
        setHeartbeatAckMaxChars("300");
      }
      setHeartbeatDirty(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save heartbeat settings.";
      setHeartbeatError(message);
    } finally {
      setHeartbeatSaving(false);
    }
  }, [
    heartbeatActiveEnd,
    heartbeatActiveHoursEnabled,
    heartbeatActiveStart,
    heartbeatAckMaxChars,
    heartbeatCustomMinutes,
    heartbeatEnabled,
    heartbeatEvery,
    heartbeatIncludeReasoning,
    heartbeatIntervalMode,
    heartbeatOverride,
    heartbeatTargetCustom,
    heartbeatTargetMode,
    client,
    agent.agentId,
    agent.sessionKey,
  ]);

  useEffect(() => {
    void loadAgentFiles();
    void loadHeartbeat();
  }, [loadAgentFiles, loadHeartbeat]);

  useEffect(() => {
    if (!AGENT_FILE_NAMES.includes(agentFileTab)) {
      setAgentFileTab(AGENT_FILE_NAMES[0]);
    }
  }, [agentFileTab]);

  const modelOptions = useMemo(
    () =>
      models.map((entry) => ({
        value: `${entry.provider}/${entry.id}`,
        label:
          entry.name === `${entry.provider}/${entry.id}`
            ? entry.name
            : `${entry.name} (${entry.provider}/${entry.id})`,
        reasoning: entry.reasoning,
      })),
    [models]
  );
  const modelValue = agent.model ?? "";
  const modelOptionsWithFallback =
    modelValue && !modelOptions.some((option) => option.value === modelValue)
      ? [{ value: modelValue, label: modelValue, reasoning: undefined }, ...modelOptions]
      : modelOptions;
  const selectedModel = modelOptionsWithFallback.find(
    (option) => option.value === modelValue
  );
  const allowThinking = selectedModel?.reasoning !== false;

  return (
    <div
      className="agent-inspect-panel"
      data-testid="agent-inspect-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inspect
          </div>
          <div className="text-sm font-semibold text-foreground">{agent.name}</div>
        </div>
        <button
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground"
          type="button"
          data-testid="agent-inspect-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <section
          className="flex min-h-[420px] flex-1 flex-col rounded-lg border border-border bg-card p-4"
          data-testid="agent-inspect-files"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Brain files
            </div>
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
              {agentFilesLoading
                ? "Loading..."
                : agentFilesDirty
                  ? "Saving on tab change"
                  : "All changes saved"}
            </div>
          </div>
          {agentFilesError ? (
            <div className="mt-3 rounded-lg border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {agentFilesError}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            {AGENT_FILE_NAMES.map((name) => {
              const active = name === agentFileTab;
              const label = AGENT_FILE_META[name].title.replace(".md", "");
              return (
                <button
                  key={name}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${
                    active
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => handleAgentFileTabChange(name)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex-1 overflow-auto rounded-lg bg-muted/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {AGENT_FILE_META[agentFileTab].title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {AGENT_FILE_META[agentFileTab].hint}
                </div>
              </div>
              {!agentFiles[agentFileTab].exists ? (
                <span className="rounded-md border border-border bg-accent px-2 py-1 text-[10px] font-semibold uppercase text-accent-foreground">
                  new
                </span>
              ) : null}
            </div>

            <textarea
              className="mt-4 min-h-[220px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
              value={agentFiles[agentFileTab].content}
              placeholder={
                agentFiles[agentFileTab].content.trim().length === 0
                  ? AGENT_FILE_PLACEHOLDERS[agentFileTab]
                  : undefined
              }
              disabled={agentFilesLoading || agentFilesSaving}
              onChange={(event) => {
                const value = event.target.value;
                setAgentFiles((prev) => ({
                  ...prev,
                  [agentFileTab]: { ...prev[agentFileTab], content: value },
                }));
                setAgentFilesDirty(true);
              }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              {agentFilesDirty ? "Auto-save on tab switch." : "Up to date."}
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border border-border bg-card p-4"
          data-testid="agent-inspect-settings"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Model</span>
              <select
                className="h-10 w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground"
                value={agent.model ?? ""}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  onModelChange(value ? value : null);
                }}
              >
                {modelOptionsWithFallback.length === 0 ? (
                  <option value="">No models found</option>
                ) : null}
                {modelOptionsWithFallback.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {allowThinking ? (
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <span>Thinking</span>
                <select
                  className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground"
                  value={agent.thinkingLevel ?? ""}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    onThinkingChange(value ? value : null);
                  }}
                >
                  <option value="">Default</option>
                  <option value="off">Off</option>
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">XHigh</option>
                </select>
              </label>
            ) : (
              <div />
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Show tool calls</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={agent.toolCallingEnabled}
                onChange={(event) => onToolCallingToggle(event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Show thinking</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={agent.showThinkingTraces}
                onChange={(event) => onThinkingTracesToggle(event.target.checked)}
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Heartbeat config
              </div>
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                {heartbeatLoading
                  ? "Loading..."
                  : heartbeatDirty
                    ? "Unsaved changes"
                    : "All changes saved"}
              </div>
            </div>
            {heartbeatError ? (
              <div className="mt-3 rounded-lg border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
                {heartbeatError}
              </div>
            ) : null}
            <label className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-muted-foreground">
              <span>Override defaults</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={heartbeatOverride}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatOverride(event.target.checked);
                  setHeartbeatDirty(true);
                }}
              />
            </label>
            <label className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-muted-foreground">
              <span>Enabled</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={heartbeatEnabled}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatEnabled(event.target.checked);
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
              />
            </label>
            <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Interval</span>
              <select
                className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground"
                value={heartbeatIntervalMode === "custom" ? "custom" : heartbeatEvery}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "custom") {
                    setHeartbeatIntervalMode("custom");
                  } else {
                    setHeartbeatIntervalMode("preset");
                    setHeartbeatEvery(value);
                  }
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
              >
                {HEARTBEAT_INTERVAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    Every {option}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </label>
            {heartbeatIntervalMode === "custom" ? (
              <input
                type="number"
                min={1}
                className="mt-2 h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none"
                value={heartbeatCustomMinutes}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatCustomMinutes(event.target.value);
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
                placeholder="Minutes"
              />
            ) : null}
            <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Target</span>
              <select
                className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground"
                value={heartbeatTargetMode}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatTargetMode(
                    event.target.value as "last" | "none" | "custom"
                  );
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
              >
                <option value="last">Last channel</option>
                <option value="none">No delivery</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {heartbeatTargetMode === "custom" ? (
              <input
                className="mt-2 h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none"
                value={heartbeatTargetCustom}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatTargetCustom(event.target.value);
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
                placeholder="Channel id (e.g., whatsapp)"
              />
            ) : null}
            <label className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-muted-foreground">
              <span>Include reasoning</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={heartbeatIncludeReasoning}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatIncludeReasoning(event.target.checked);
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
              />
            </label>
            <label className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-muted-foreground">
              <span>Active hours</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={heartbeatActiveHoursEnabled}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatActiveHoursEnabled(event.target.checked);
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
              />
            </label>
            {heartbeatActiveHoursEnabled ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="time"
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none"
                  value={heartbeatActiveStart}
                  disabled={heartbeatLoading || heartbeatSaving}
                  onChange={(event) => {
                    setHeartbeatActiveStart(event.target.value);
                    setHeartbeatOverride(true);
                    setHeartbeatDirty(true);
                  }}
                />
                <input
                  type="time"
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none"
                  value={heartbeatActiveEnd}
                  disabled={heartbeatLoading || heartbeatSaving}
                  onChange={(event) => {
                    setHeartbeatActiveEnd(event.target.value);
                    setHeartbeatOverride(true);
                    setHeartbeatDirty(true);
                  }}
                />
              </div>
            ) : null}
            <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>ACK max chars</span>
              <input
                type="number"
                min={0}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none"
                value={heartbeatAckMaxChars}
                disabled={heartbeatLoading || heartbeatSaving}
                onChange={(event) => {
                  setHeartbeatAckMaxChars(event.target.value);
                  setHeartbeatOverride(true);
                  setHeartbeatDirty(true);
                }}
              />
            </label>
            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {heartbeatDirty ? "Remember to save changes." : "Up to date."}
              </div>
              <button
                className="rounded-lg border border-transparent bg-primary px-4 py-2 text-xs font-semibold uppercase text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                type="button"
                disabled={heartbeatLoading || heartbeatSaving || !heartbeatDirty}
                onClick={() => void saveHeartbeat()}
              >
                {heartbeatSaving ? "Saving..." : "Save heartbeat"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Delete agent
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Removes the agent from the gateway config.
          </div>
          <button
            className="mt-3 w-full rounded-lg border border-destructive bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground shadow-sm transition hover:brightness-105"
            type="button"
            onClick={onDelete}
          >
            Delete agent
          </button>
        </section>
      </div>
    </div>
  );
};
