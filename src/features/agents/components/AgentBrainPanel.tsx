"use client";

import { useCallback, useMemo } from "react";
import type { AgentState } from "@/features/agents/state/store";
import {
  AGENT_FILE_META,
  AGENT_FILE_NAMES,
  AGENT_FILE_PLACEHOLDERS,
  type AgentFileName,
} from "@/lib/agents/agentFiles";
import { useAgentFilesEditor } from "@/features/agents/state/useAgentFilesEditor";

type AgentBrainPanelProps = {
  agents: AgentState[];
  selectedAgentId: string | null;
  onClose: () => void;
};

export const AgentBrainPanel = ({
  agents,
  selectedAgentId,
  onClose,
}: AgentBrainPanelProps) => {
  const selectedAgent = useMemo(
    () =>
      selectedAgentId
        ? agents.find((entry) => entry.agentId === selectedAgentId) ?? null
        : null,
    [agents, selectedAgentId]
  );

  const {
    agentFiles,
    agentFileTab,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
  } = useAgentFilesEditor(selectedAgent?.sessionKey ?? null);

  const handleTabChange = useCallback(
    async (nextTab: AgentFileName) => {
      await handleAgentFileTabChange(nextTab);
    },
    [handleAgentFileTabChange]
  );

  return (
    <div
      className="agent-inspect-panel"
      data-testid="agent-brain-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Brain files
          </div>
          <div className="console-title text-2xl leading-none text-foreground">
            {selectedAgent?.name ?? "No agent selected"}
          </div>
        </div>
        <button
          className="rounded-md border border-border/80 bg-card/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-border hover:bg-muted/65"
          type="button"
          data-testid="agent-brain-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="flex min-h-0 h-[calc(100%-72px)] flex-col p-4">
        <section className="flex min-h-[420px] flex-1 flex-col" data-testid="agent-brain-files">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {AGENT_FILE_META[agentFileTab].hint}
            </div>
          </div>
          {agentFilesError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
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
                  className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                    active
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent bg-muted/60 text-muted-foreground hover:border-border/80 hover:bg-muted"
                  }`}
                  onClick={() => {
                    void handleTabChange(name);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex-1 overflow-auto rounded-md bg-muted/30 p-2">
            <textarea
              className="min-h-[220px] w-full resize-none rounded-md border border-border/80 bg-background/80 px-3 py-2 font-mono text-xs text-foreground outline-none"
              value={agentFiles[agentFileTab].content}
              placeholder={
                agentFiles[agentFileTab].content.trim().length === 0
                  ? AGENT_FILE_PLACEHOLDERS[agentFileTab]
                  : undefined
              }
              disabled={agentFilesLoading || agentFilesSaving}
              onChange={(event) => {
                setAgentFileContent(event.target.value);
              }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">All changes saved</div>
          </div>
        </section>
      </div>
    </div>
  );
};
