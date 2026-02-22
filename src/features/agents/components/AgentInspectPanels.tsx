"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, ExternalLink, ListChecks, Play, Sun, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AgentState } from "@/features/agents/state/store";
import type { CronCreateDraft, CronCreateTemplateId } from "@/lib/cron/createPayloadBuilder";
import { formatCronPayload, formatCronSchedule, type CronJobSummary } from "@/lib/cron/types";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { readGatewayAgentFile, writeGatewayAgentFile } from "@/lib/gateway/agentFiles";
import {
  resolveExecutionRoleFromAgent,
  resolvePresetDefaultsForRole,
  type AgentPermissionsDraft,
} from "@/features/agents/operations/agentPermissionsOperation";
import {
  AGENT_FILE_NAMES,
  AGENT_FILE_PLACEHOLDERS,
  PERSONALITY_FILE_LABELS,
  PERSONALITY_FILE_NAMES,
  type PersonalityFileName,
  createAgentFilesState,
  isAgentFileName,
} from "@/lib/agents/agentFiles";

const AgentInspectHeader = ({
  label,
  title,
  onClose,
  closeTestId,
  closeDisabled,
}: {
  label?: string;
  title?: string;
  onClose: () => void;
  closeTestId: string;
  closeDisabled?: boolean;
}) => {
  const normalizedLabel = label?.trim() ?? "";
  const normalizedTitle = title?.trim() ?? "";
  const hasLabel = normalizedLabel.length > 0;
  const hasTitle = normalizedTitle.length > 0;
  if (!hasLabel && !hasTitle) {
    return null;
  }
  return (
    <div className="flex items-center justify-between pl-4 pr-2 pb-3 pt-2">
      <div>
        {hasLabel ? (
          <div className="font-mono text-[9px] font-medium tracking-[0.04em] text-muted-foreground/58">
            {normalizedLabel}
          </div>
        ) : null}
        {hasTitle ? (
          <div
            className={
              hasLabel
                ? "text-[1.45rem] font-semibold leading-[1.05] tracking-[0.01em] text-foreground"
                : "font-mono text-[12px] font-semibold tracking-[0.05em] text-foreground"
            }
          >
            {normalizedTitle}
          </div>
        ) : null}
      </div>
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/55 transition hover:bg-surface-2 hover:text-muted-foreground/85"
        type="button"
        data-testid={closeTestId}
        aria-label="Close panel"
        disabled={closeDisabled}
        onClick={onClose}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

type AgentSettingsPanelProps = {
  agent: AgentState;
  mode?: "capabilities" | "automations" | "advanced";
  onClose: () => void;
  permissionsDraft?: AgentPermissionsDraft;
  onUpdateAgentPermissions?: (draft: AgentPermissionsDraft) => Promise<void> | void;
  onDelete: () => void;
  canDelete?: boolean;
  onToolCallingToggle: (enabled: boolean) => void;
  onThinkingTracesToggle: (enabled: boolean) => void;
  cronJobs: CronJobSummary[];
  cronLoading: boolean;
  cronError: string | null;
  cronRunBusyJobId: string | null;
  cronDeleteBusyJobId: string | null;
  onRunCronJob: (jobId: string) => Promise<void> | void;
  onDeleteCronJob: (jobId: string) => Promise<void> | void;
  cronCreateBusy?: boolean;
  onCreateCronJob?: (draft: CronCreateDraft) => Promise<void> | void;
  controlUiUrl?: string | null;
};

const formatCronStateLine = (job: CronJobSummary): string | null => {
  if (typeof job.state.runningAtMs === "number" && Number.isFinite(job.state.runningAtMs)) {
    return "Running now";
  }
  if (typeof job.state.nextRunAtMs === "number" && Number.isFinite(job.state.nextRunAtMs)) {
    return `Next: ${new Date(job.state.nextRunAtMs).toLocaleString()}`;
  }
  if (typeof job.state.lastRunAtMs === "number" && Number.isFinite(job.state.lastRunAtMs)) {
    const status = job.state.lastStatus ? `${job.state.lastStatus} ` : "";
    return `Last: ${status}${new Date(job.state.lastRunAtMs).toLocaleString()}`.trim();
  }
  return null;
};

const getFirstLinePreview = (value: string, maxChars: number): string => {
  const firstLine =
    value
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  if (!firstLine) return "";
  if (firstLine.length <= maxChars) return firstLine;
  return `${firstLine.slice(0, maxChars)}...`;
};

type CronTemplateOption = {
  id: CronCreateTemplateId;
  title: string;
  description: string;
  icon: typeof Sun;
};

const CRON_TEMPLATE_OPTIONS: CronTemplateOption[] = [
  {
    id: "morning-brief",
    title: "Morning Brief",
    description: "Daily status summary with overnight updates.",
    icon: Sun,
  },
  {
    id: "reminder",
    title: "Reminder",
    description: "A timed nudge for a specific event or task.",
    icon: Bell,
  },
  {
    id: "weekly-review",
    title: "Weekly Review",
    description: "Recurring synthesis across a longer time window.",
    icon: CalendarDays,
  },
  {
    id: "inbox-triage",
    title: "Inbox Triage",
    description: "Regular sorting and summarizing of incoming updates.",
    icon: ListChecks,
  },
  {
    id: "custom",
    title: "Custom",
    description: "Start from a blank flow and choose each setting.",
    icon: ListChecks,
  },
];

const TIMED_AUTOMATION_STEP_META: Array<{ title: string; indicator: string }> = [
  { title: "Choose type", indicator: "Type" },
  { title: "Define function", indicator: "Function" },
  { title: "Set timing", indicator: "Timing" },
  { title: "Review and create", indicator: "Review" },
];

const resolveLocalTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const createInitialCronDraft = (): CronCreateDraft => ({
  templateId: "morning-brief",
  name: "",
  taskText: "",
  scheduleKind: "every",
  everyAmount: 30,
  everyUnit: "minutes",
  everyAtTime: "09:00",
  everyTimeZone: resolveLocalTimeZone(),
  deliveryMode: "none",
  deliveryChannel: "last",
});

const applyTemplateDefaults = (templateId: CronCreateTemplateId, current: CronCreateDraft): CronCreateDraft => {
  const nextTimeZone = (current.everyTimeZone ?? "").trim() || resolveLocalTimeZone();
  const base = {
    ...createInitialCronDraft(),
    deliveryMode: current.deliveryMode ?? "none",
    deliveryChannel: current.deliveryChannel || "last",
    deliveryTo: current.deliveryTo,
    advancedSessionTarget: current.advancedSessionTarget,
    advancedWakeMode: current.advancedWakeMode,
    everyTimeZone: nextTimeZone,
  } satisfies CronCreateDraft;

  if (templateId === "morning-brief") {
    return {
      ...base,
      templateId,
      name: "Morning brief",
      taskText: "Summarize overnight updates and priorities.",
      scheduleKind: "every",
      everyAmount: 1,
      everyUnit: "days",
      everyAtTime: "07:00",
    };
  }
  if (templateId === "reminder") {
    return {
      ...base,
      templateId,
      name: "Reminder",
      taskText: "Reminder: follow up on today's priority task.",
      scheduleKind: "at",
      scheduleAt: "",
    };
  }
  if (templateId === "weekly-review") {
    return {
      ...base,
      templateId,
      name: "Weekly review",
      taskText: "Summarize wins, blockers, and next-week priorities.",
      scheduleKind: "every",
      everyAmount: 7,
      everyUnit: "days",
      everyAtTime: "09:00",
    };
  }
  if (templateId === "inbox-triage") {
    return {
      ...base,
      templateId,
      name: "Inbox triage",
      taskText: "Triage unread updates and surface the top actions.",
      scheduleKind: "every",
      everyAmount: 30,
      everyUnit: "minutes",
    };
  }
  return {
    ...base,
    templateId: "custom",
    name: "",
    taskText: "",
    scheduleKind: "every",
    everyAmount: 30,
    everyUnit: "minutes",
  };
};

export const AgentSettingsPanel = ({
  agent,
  mode = "capabilities",
  onClose,
  permissionsDraft,
  onUpdateAgentPermissions = () => {},
  onDelete,
  canDelete = true,
  onToolCallingToggle,
  onThinkingTracesToggle,
  cronJobs,
  cronLoading,
  cronError,
  cronRunBusyJobId,
  cronDeleteBusyJobId,
  onRunCronJob,
  onDeleteCronJob,
  cronCreateBusy = false,
  onCreateCronJob = () => {},
  controlUiUrl = null,
}: AgentSettingsPanelProps) => {
  const [permissionsDraftValue, setPermissionsDraftValue] = useState<AgentPermissionsDraft>(
    permissionsDraft ?? resolvePresetDefaultsForRole(resolveExecutionRoleFromAgent(agent))
  );
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [permissionsSaveState, setPermissionsSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [permissionsSaveError, setPermissionsSaveError] = useState<string | null>(null);
  const permissionsSaveTimerRef = useRef<number | null>(null);
  const [expandedCronJobIds, setExpandedCronJobIds] = useState<Set<string>>(() => new Set());
  const [cronCreateOpen, setCronCreateOpen] = useState(false);
  const [cronCreateStep, setCronCreateStep] = useState(0);
  const [cronCreateError, setCronCreateError] = useState<string | null>(null);
  const [cronDraft, setCronDraft] = useState<CronCreateDraft>(createInitialCronDraft);

  const resolvedExecutionRole = useMemo(() => resolveExecutionRoleFromAgent(agent), [agent]);
  const resolvedPermissionsDraft = useMemo(
    () => permissionsDraft ?? resolvePresetDefaultsForRole(resolvedExecutionRole),
    [permissionsDraft, resolvedExecutionRole]
  );
  const permissionsDirty = useMemo(
    () =>
      permissionsDraftValue.commandMode !== resolvedPermissionsDraft.commandMode ||
      permissionsDraftValue.webAccess !== resolvedPermissionsDraft.webAccess ||
      permissionsDraftValue.fileTools !== resolvedPermissionsDraft.fileTools,
    [permissionsDraftValue, resolvedPermissionsDraft]
  );

  useEffect(() => {
    setPermissionsDraftValue(resolvedPermissionsDraft);
    setPermissionsSaveState("idle");
    setPermissionsSaveError(null);
    setPermissionsSaving(false);
  }, [agent.agentId, resolvedExecutionRole, resolvedPermissionsDraft]);

  const runPermissionsSave = useCallback(async (draft: AgentPermissionsDraft) => {
    if (permissionsSaving) return;
    setPermissionsSaving(true);
    setPermissionsSaveState("saving");
    setPermissionsSaveError(null);
    try {
      await onUpdateAgentPermissions(draft);
      setPermissionsSaveState("saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save permissions.";
      setPermissionsSaveState("error");
      setPermissionsSaveError(message);
    } finally {
      setPermissionsSaving(false);
    }
  }, [onUpdateAgentPermissions, permissionsSaving]);

  useEffect(() => {
    return () => {
      if (permissionsSaveTimerRef.current !== null) {
        window.clearTimeout(permissionsSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!permissionsDirty) return;
    if (permissionsSaving) return;
    if (permissionsSaveTimerRef.current !== null) {
      window.clearTimeout(permissionsSaveTimerRef.current);
    }
    setPermissionsSaveState("idle");
    permissionsSaveTimerRef.current = window.setTimeout(() => {
      permissionsSaveTimerRef.current = null;
      void runPermissionsSave(permissionsDraftValue);
    }, 450);
    return () => {
      if (permissionsSaveTimerRef.current !== null) {
        window.clearTimeout(permissionsSaveTimerRef.current);
        permissionsSaveTimerRef.current = null;
      }
    };
  }, [permissionsDirty, permissionsDraftValue, permissionsSaving, runPermissionsSave]);

  const openCronCreate = () => {
    setCronCreateOpen(true);
    setCronCreateStep(0);
    setCronCreateError(null);
    setCronDraft(createInitialCronDraft());
  };

  const closeCronCreate = () => {
    setCronCreateOpen(false);
    setCronCreateStep(0);
    setCronCreateError(null);
    setCronDraft(createInitialCronDraft());
  };

  const updateCronDraft = (patch: Partial<CronCreateDraft>) => {
    setCronDraft((prev) => ({ ...prev, ...patch }));
  };

  const selectCronTemplate = (templateId: CronCreateTemplateId) => {
    setCronDraft((prev) => applyTemplateDefaults(templateId, prev));
  };

  const canMoveToScheduleStep = cronDraft.name.trim().length > 0 && cronDraft.taskText.trim().length > 0;
  const canMoveToReviewStep =
    cronDraft.scheduleKind === "every"
      ? Number.isFinite(cronDraft.everyAmount) &&
        (cronDraft.everyAmount ?? 0) > 0 &&
        (cronDraft.everyUnit !== "days" ||
          ((cronDraft.everyAtTime ?? "").trim().length > 0 &&
            (cronDraft.everyTimeZone ?? "").trim().length > 0))
      : (cronDraft.scheduleAt ?? "").trim().length > 0;
  const canSubmitCronCreate = canMoveToScheduleStep && canMoveToReviewStep;

  const submitCronCreate = async () => {
    if (cronCreateBusy || !canSubmitCronCreate) {
      return;
    }
    setCronCreateError(null);
    const payload: CronCreateDraft = {
      templateId: cronDraft.templateId,
      name: cronDraft.name.trim(),
      taskText: cronDraft.taskText.trim(),
      scheduleKind: cronDraft.scheduleKind,
      ...(typeof cronDraft.everyAmount === "number" ? { everyAmount: cronDraft.everyAmount } : {}),
      ...(cronDraft.everyUnit ? { everyUnit: cronDraft.everyUnit } : {}),
      ...(cronDraft.everyUnit === "days" && cronDraft.everyAtTime
        ? { everyAtTime: cronDraft.everyAtTime }
        : {}),
      ...(cronDraft.everyUnit === "days" && cronDraft.everyTimeZone
        ? { everyTimeZone: cronDraft.everyTimeZone }
        : {}),
      ...(cronDraft.scheduleAt ? { scheduleAt: cronDraft.scheduleAt } : {}),
      ...(cronDraft.deliveryMode ? { deliveryMode: cronDraft.deliveryMode } : {}),
      ...(cronDraft.deliveryChannel ? { deliveryChannel: cronDraft.deliveryChannel } : {}),
      ...(cronDraft.deliveryTo ? { deliveryTo: cronDraft.deliveryTo } : {}),
      ...(cronDraft.advancedSessionTarget
        ? { advancedSessionTarget: cronDraft.advancedSessionTarget }
        : {}),
      ...(cronDraft.advancedWakeMode ? { advancedWakeMode: cronDraft.advancedWakeMode } : {}),
    };
    try {
      await onCreateCronJob(payload);
      closeCronCreate();
    } catch (err) {
      setCronCreateError(err instanceof Error ? err.message : "Failed to create automation.");
    }
  };

  const moveCronCreateBack = () => {
    setCronCreateStep((prev) => Math.max(0, prev - 1));
  };

  const moveCronCreateNext = () => {
    if (cronCreateStep === 0) {
      setCronCreateStep(1);
      return;
    }
    if (cronCreateStep === 1 && canMoveToScheduleStep) {
      setCronCreateStep(2);
      return;
    }
    if (cronCreateStep === 2 && canMoveToReviewStep) {
      setCronCreateStep(3);
    }
  };

  const panelLabel = mode === "advanced" ? "Advanced" : "";
  const canOpenControlUi = typeof controlUiUrl === "string" && controlUiUrl.trim().length > 0;
  const timedAutomationStepMeta =
    TIMED_AUTOMATION_STEP_META[cronCreateStep] ??
    TIMED_AUTOMATION_STEP_META[TIMED_AUTOMATION_STEP_META.length - 1];

  return (
    <div
      className="agent-inspect-panel"
      data-testid="agent-settings-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <AgentInspectHeader
        label={panelLabel}
        title={agent.name}
        onClose={onClose}
        closeTestId="agent-settings-close"
      />

      <div className="flex flex-col gap-0 px-5 pb-5">
        {mode === "capabilities" ? (
          <>
            <section
              className="sidebar-section"
              data-testid="agent-settings-permissions"
            >
              <div className="mt-2 flex flex-col gap-8">
                <div className="px-1 py-1">
                  <div className="sidebar-copy flex flex-col gap-1 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/88">Run commands</span>
                    <div
                      className="ui-segment ui-segment-command-mode mt-2 grid-cols-3"
                      role="group"
                      aria-label="Run commands"
                    >
                      {(
                        [
                          { id: "off", label: "Off" },
                          { id: "ask", label: "Ask" },
                          { id: "auto", label: "Auto" },
                        ] as const
                      ).map((option) => {
                        const selected = permissionsDraftValue.commandMode === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-label={`Run commands ${option.label.toLowerCase()}`}
                            aria-pressed={selected}
                            className="ui-segment-item px-3 py-2.5 text-center font-mono text-[11px] font-semibold tracking-[0.04em]"
                            data-active={selected ? "true" : "false"}
                            onClick={() =>
                              setPermissionsDraftValue((current) => ({
                                ...current,
                                commandMode: option.id,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="ui-settings-row flex min-h-[68px] items-center justify-between gap-6 px-4 py-3">
                  <div className="sidebar-copy flex flex-col">
                    <span className="text-[11px] font-medium text-foreground/88">Web access</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Web access"
                    aria-checked={permissionsDraftValue.webAccess}
                    className={`ui-switch self-center ${permissionsDraftValue.webAccess ? "ui-switch--on" : ""}`}
                    onClick={() =>
                      setPermissionsDraftValue((current) => ({
                        ...current,
                        webAccess: !current.webAccess,
                      }))
                    }
                  >
                    <span className="ui-switch-thumb" />
                  </button>
                </div>
                <div className="ui-settings-row flex min-h-[68px] items-center justify-between gap-6 px-4 py-3">
                  <div className="sidebar-copy flex flex-col">
                    <span className="text-[11px] font-medium text-foreground/88">File tools</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      Lets this agent read and edit files in its workspace.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="File tools"
                    aria-checked={permissionsDraftValue.fileTools}
                    className={`ui-switch self-center ${permissionsDraftValue.fileTools ? "ui-switch--on" : ""}`}
                    onClick={() =>
                      setPermissionsDraftValue((current) => ({
                        ...current,
                        fileTools: !current.fileTools,
                      }))
                    }
                  >
                    <span className="ui-switch-thumb" />
                  </button>
                </div>
                <div className="ui-settings-row flex min-h-[68px] items-center justify-between gap-6 px-4 py-3">
                  <div className="sidebar-copy flex flex-col">
                    <span className="text-[11px] font-medium text-foreground/88">Skills</span>
                    <span className="text-[10px] text-muted-foreground/70">Coming soon</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Skills"
                    aria-checked="false"
                    className="ui-switch self-center"
                    disabled
                  >
                    <span className="ui-switch-thumb" />
                  </button>
                </div>
                <div className="ui-settings-row flex min-h-[68px] items-center justify-between gap-6 px-4 py-3">
                  <div className="sidebar-copy flex flex-col">
                    <span className="text-[11px] font-medium text-foreground/88">Browser automation</span>
                    <span className="text-[10px] text-muted-foreground/70">Coming soon</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Browser automation"
                    aria-checked="false"
                    className="ui-switch self-center"
                    disabled
                  >
                    <span className="ui-switch-thumb" />
                  </button>
                </div>
              </div>
              <div className="sidebar-copy mt-3 text-[11px] text-muted-foreground">
                {permissionsSaveState === "saving" ? "Saving..." : null}
                {permissionsSaveState === "saved" ? "Saved." : null}
                {permissionsSaveState === "error" && permissionsSaveError ? (
                  <span>
                    Couldn&apos;t save. {permissionsSaveError}{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => {
                        void runPermissionsSave(permissionsDraftValue);
                      }}
                    >
                      Retry
                    </button>
                  </span>
                ) : null}
              </div>
              {permissionsSaveState === "error" && !permissionsSaveError ? (
                <div className="ui-alert-danger mt-3 rounded-md px-3 py-2 text-xs">
                  Couldn&apos;t save permissions.
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {mode === "automations" ? (
          <section
            className="sidebar-section"
            data-testid="agent-settings-cron"
          >
          <div className="flex items-center justify-between gap-2">
            <h3 className="sidebar-section-title">Timed automations</h3>
            {!cronLoading && !cronError && cronJobs.length > 0 ? (
              <button
                className="sidebar-btn-ghost px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={openCronCreate}
              >
                Create
              </button>
            ) : null}
          </div>
          {cronLoading ? (
            <div className="mt-3 text-[11px] text-muted-foreground">Loading timed automations...</div>
          ) : null}
          {!cronLoading && cronError ? (
            <div className="ui-alert-danger mt-3 rounded-md px-3 py-2 text-xs">
              {cronError}
            </div>
          ) : null}
          {!cronLoading && !cronError && cronJobs.length === 0 ? (
            <div className="sidebar-card mt-3 flex flex-col items-center justify-center gap-4 px-5 py-6 text-center">
              <CalendarDays
                className="h-4 w-4 text-muted-foreground/70"
                aria-hidden="true"
                data-testid="cron-empty-icon"
              />
              <div className="sidebar-copy text-[11px] text-muted-foreground/82">
                No timed automations for this agent.
              </div>
              <button
                className="sidebar-btn-primary mt-2 w-auto min-w-[116px] self-center px-4 py-2 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={openCronCreate}
              >
                Create
              </button>
            </div>
          ) : null}
          {!cronLoading && !cronError && cronJobs.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
              {cronJobs.map((job) => {
                const runBusy = cronRunBusyJobId === job.id;
                const deleteBusy = cronDeleteBusyJobId === job.id;
                const busy = runBusy || deleteBusy;
                const scheduleText = formatCronSchedule(job.schedule);
                const payloadText = formatCronPayload(job.payload).trim();
                const payloadPreview = getFirstLinePreview(payloadText, 160);
                const payloadExpandable =
                  payloadText.length > payloadPreview.length || payloadText.split("\n").length > 1;
                const expanded = expandedCronJobIds.has(job.id);
                const stateLine = formatCronStateLine(job);
                return (
                  <div key={job.id} className="group/cron ui-card flex items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                          {job.name}
                        </div>
                        {!job.enabled ? (
                          <div className="shrink-0 rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground shadow-2xs">
                            Disabled
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Frequency
                        </span>
                        <div className="break-words">{scheduleText}</div>
                      </div>
                      {stateLine ? (
                        <div className="mt-1 break-words text-[11px] text-muted-foreground">
                          {stateLine}
                        </div>
                      ) : null}
                      {payloadText ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Task
                            </span>
                            {payloadExpandable ? (
                              <button
                                className="ui-btn-secondary shrink-0 min-h-0 px-2 py-0.5 font-mono text-[9px] font-semibold tracking-[0.06em] text-muted-foreground"
                                type="button"
                                onClick={() => {
                                  setExpandedCronJobIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(job.id)) {
                                      next.delete(job.id);
                                    } else {
                                      next.add(job.id);
                                    }
                                    return next;
                                  });
                                }}
                              >
                                {expanded ? "Less" : "More"}
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap break-words" title={payloadText}>
                            {expanded ? payloadText : payloadPreview || payloadText}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition group-focus-within/cron:opacity-100 group-hover/cron:opacity-100">
                      <button
                        className="ui-btn-icon h-7 w-7 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Run timed automation ${job.name} now`}
                        onClick={() => {
                          void onRunCronJob(job.id);
                        }}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="ui-btn-icon ui-btn-icon-danger h-7 w-7 bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Delete timed automation ${job.name}`}
                        onClick={() => {
                          void onDeleteCronJob(job.id);
                        }}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <section
            className="sidebar-section"
            data-testid="agent-settings-heartbeat-coming-soon"
          >
            <h3 className="sidebar-section-title">Heartbeats</h3>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Heartbeat automation controls are coming soon.
            </div>
          </section>
          </section>
        ) : null}

        {mode === "advanced" ? (
          <>
            <section
              className="sidebar-section"
              data-testid="agent-settings-display"
            >
              <h3 className="sidebar-section-title">Display</h3>
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <div className="ui-settings-row flex min-h-[68px] items-center justify-between gap-6 px-4 py-3">
              <div className="sidebar-copy flex flex-col">
                <span className="text-[11px] font-medium text-foreground/88">Show tool calls</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Show tool calls"
                aria-checked={agent.toolCallingEnabled}
                className={`ui-switch shrink-0 self-center ${agent.toolCallingEnabled ? "ui-switch--on" : ""}`}
                onClick={() => onToolCallingToggle(!agent.toolCallingEnabled)}
              >
                <span className="ui-switch-thumb" />
              </button>
            </div>
            <div className="ui-settings-row flex min-h-[68px] items-center justify-between gap-6 px-4 py-3">
              <div className="sidebar-copy flex flex-col">
                <span className="text-[11px] font-medium text-foreground/88">Show thinking</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Show thinking"
                aria-checked={agent.showThinkingTraces}
                className={`ui-switch shrink-0 self-center ${agent.showThinkingTraces ? "ui-switch--on" : ""}`}
                onClick={() => onThinkingTracesToggle(!agent.showThinkingTraces)}
              >
                <span className="ui-switch-thumb" />
              </button>
            </div>
          </div>
            </section>

            <section className="sidebar-section mt-8" data-testid="agent-settings-control-ui">
              <h3 className="sidebar-section-title ui-text-danger">Danger Zone</h3>
              <div className="ui-alert-danger mt-3 rounded-md px-3 py-3 text-[11px]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <div className="font-medium">Advanced users only.</div>
                    <div>Open the full OpenClaw Control UI outside Studio.</div>
                    <div>Changes there can break agent behavior or put Studio out of sync.</div>
                  </div>
                </div>
              </div>
              {canOpenControlUi ? (
                <a
                  className="sidebar-btn-primary ui-btn-danger mt-3 flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-center font-mono text-[10px] font-semibold tracking-[0.06em]"
                  href={controlUiUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Full Control UI
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : (
                <>
                  <button
                    className="sidebar-btn-primary ui-btn-danger mt-3 w-full px-3 py-2.5 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-65"
                    type="button"
                    disabled
                  >
                    Open Full Control UI
                  </button>
                  <div className="mt-2 text-[10px] text-muted-foreground/70">
                    Control UI link unavailable for this gateway.
                  </div>
                </>
              )}
              <div className="mt-2 text-[10px] text-muted-foreground/75">Opens in a new tab.</div>
            </section>

            {canDelete ? (
              <section className="sidebar-section mt-8">
                <h3 className="sidebar-section-title ui-text-danger">Delete agent</h3>
                <div className="mt-3 text-[11px] text-muted-foreground/68">
                  Removes the agent from the gateway config and deletes its scheduled automations.
                </div>
                <button
                  className="sidebar-btn-ghost ui-btn-danger mt-3 w-full px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.06em]"
                  type="button"
                  onClick={onDelete}
                >
                  Delete agent
                </button>
              </section>
            ) : (
              <section className="sidebar-section mt-8">
                <h3 className="sidebar-section-title">System agent</h3>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  The main agent is reserved and cannot be deleted.
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
      {cronCreateOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create automation"
          onClick={closeCronCreate}
        >
          <div
            className="ui-panel w-full max-w-2xl bg-card shadow-xs"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-6 py-5">
              <div className="min-w-0">
                <div className="text-[11px] font-medium tracking-[0.01em] text-muted-foreground/80">
                  Timed automation composer
                </div>
                <div className="mt-1 text-base font-semibold text-foreground">{timedAutomationStepMeta.title}</div>
              </div>
              <button
                type="button"
                className="sidebar-btn-ghost px-3 font-mono text-[10px] font-semibold tracking-[0.06em]"
                onClick={closeCronCreate}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              {cronCreateError ? (
                <div className="ui-alert-danger rounded-md px-3 py-2 text-xs">
                  {cronCreateError}
                </div>
              ) : null}
              {cronCreateStep === 0 ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Pick a template to start quickly, or choose Custom.
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CRON_TEMPLATE_OPTIONS.map((option) => {
                      const active = option.id === cronDraft.templateId;
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-label={option.title}
                          className={`ui-card px-3 py-3 text-left transition ${
                            active
                              ? "ui-selected"
                              : "bg-surface-2/60 hover:bg-surface-3/90"
                          }`}
                          onClick={() => selectCronTemplate(option.id)}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-foreground" />
                            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                              {option.title}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{option.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {cronCreateStep === 1 ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Name this automation and describe what it should do.
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                      Automation name
                    </span>
                    <input
                      aria-label="Automation name"
                      className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                      value={cronDraft.name}
                      onChange={(event) => updateCronDraft({ name: event.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                      Task
                    </span>
                    <textarea
                      aria-label="Task"
                      className="min-h-28 rounded-md border border-border bg-surface-3 px-3 py-2 text-sm text-foreground outline-none"
                      value={cronDraft.taskText}
                      onChange={(event) => updateCronDraft({ taskText: event.target.value })}
                    />
                  </label>
                </div>
              ) : null}
              {cronCreateStep === 2 ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">Choose when this should run.</div>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                      Schedule type
                    </span>
                    <select
                      className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                      value={cronDraft.scheduleKind}
                      onChange={(event) =>
                        updateCronDraft({ scheduleKind: event.target.value as CronCreateDraft["scheduleKind"] })
                      }
                    >
                      <option value="every">Every</option>
                      <option value="at">One time</option>
                    </select>
                  </label>
                  {cronDraft.scheduleKind === "every" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                          Every
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                          value={String(cronDraft.everyAmount ?? 30)}
                          onChange={(event) =>
                            updateCronDraft({
                              everyAmount: Number.parseInt(event.target.value, 10) || 0,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                          Unit
                        </span>
                        <select
                          className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                          value={cronDraft.everyUnit ?? "minutes"}
                          onChange={(event) =>
                            updateCronDraft({
                              everyUnit: event.target.value as CronCreateDraft["everyUnit"],
                            })
                          }
                        >
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </label>
                      {cronDraft.everyUnit === "days" ? (
                        <>
                          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                              Time of day
                            </span>
                            <input
                              type="time"
                              className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                              value={cronDraft.everyAtTime ?? "09:00"}
                              onChange={(event) => updateCronDraft({ everyAtTime: event.target.value })}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                              Timezone
                            </span>
                            <input
                              className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                              value={cronDraft.everyTimeZone ?? resolveLocalTimeZone()}
                              onChange={(event) => updateCronDraft({ everyTimeZone: event.target.value })}
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {cronDraft.scheduleKind === "at" ? (
                    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                        Run at
                      </span>
                      <input
                        type="datetime-local"
                        className="h-10 rounded-md border border-border bg-surface-3 px-3 text-sm text-foreground outline-none"
                        value={cronDraft.scheduleAt ?? ""}
                        onChange={(event) => updateCronDraft({ scheduleAt: event.target.value })}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {cronCreateStep === 3 ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>Review details before creating this automation.</div>
                  <div className="ui-card px-3 py-2">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                      {cronDraft.name || "Untitled automation"}
                    </div>
                    <div className="mt-1 text-[11px]">{cronDraft.taskText || "No task provided."}</div>
                    <div className="mt-2 text-[11px]">
                      Schedule:{" "}
                      {cronDraft.scheduleKind === "every"
                        ? `Every ${cronDraft.everyAmount ?? 0} ${cronDraft.everyUnit ?? "minutes"}${
                            cronDraft.everyUnit === "days"
                              ? ` at ${cronDraft.everyAtTime ?? ""} (${cronDraft.everyTimeZone ?? resolveLocalTimeZone()})`
                              : ""
                          }`
                        : `At ${cronDraft.scheduleAt ?? ""}`}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-5 pb-4 pt-5">
              <div className="text-[11px] text-muted-foreground">
                {timedAutomationStepMeta.indicator} · Step {cronCreateStep + 1} of 4
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="sidebar-btn-ghost px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={moveCronCreateBack}
                  disabled={cronCreateStep === 0 || cronCreateBusy}
                >
                  Back
                </button>
                {cronCreateStep < 3 ? (
                  <button
                    type="button"
                    className="sidebar-btn-ghost px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={moveCronCreateNext}
                    disabled={
                      cronCreateBusy ||
                      (cronCreateStep === 1 && !canMoveToScheduleStep) ||
                      (cronCreateStep === 2 && !canMoveToReviewStep)
                    }
                  >
                    Next
                  </button>
                ) : null}
                {cronCreateStep === 3 ? (
                  <button
                    type="button"
                    className="sidebar-btn-primary px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                    onClick={() => {
                      void submitCronCreate();
                    }}
                    disabled={cronCreateBusy || !canSubmitCronCreate}
                  >
                    Create automation
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

type AgentBrainPanelProps = {
  client: GatewayClient;
  agents: AgentState[];
  selectedAgentId: string | null;
  onUnsavedChangesChange?: (dirty: boolean) => void;
};

type AgentFilesState = ReturnType<typeof createAgentFilesState>;

type UseAgentFilesEditorResult = {
  agentFiles: AgentFilesState;
  agentFileTab: PersonalityFileName;
  agentFilesLoading: boolean;
  agentFilesSaving: boolean;
  agentFilesDirty: boolean;
  agentFilesError: string | null;
  setAgentFileContent: (value: string) => void;
  handleAgentFileTabChange: (nextTab: PersonalityFileName) => void;
  saveAgentFiles: () => Promise<boolean>;
  discardAgentFileChanges: () => void;
};

const useAgentFilesEditor = (params: {
  client: GatewayClient | null | undefined;
  agentId: string | null | undefined;
}): UseAgentFilesEditorResult => {
  const { client, agentId } = params;
  const [agentFiles, setAgentFiles] = useState(createAgentFilesState);
  const [agentFileTab, setAgentFileTab] = useState<PersonalityFileName>(PERSONALITY_FILE_NAMES[0]);
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [agentFilesSaving, setAgentFilesSaving] = useState(false);
  const [agentFilesDirty, setAgentFilesDirty] = useState(false);
  const [agentFilesError, setAgentFilesError] = useState<string | null>(null);
  const savedAgentFilesRef = useRef<AgentFilesState>(createAgentFilesState());

  const cloneAgentFilesState = useCallback((source: AgentFilesState): AgentFilesState => {
    const next = createAgentFilesState();
    for (const name of AGENT_FILE_NAMES) {
      next[name] = { ...source[name] };
    }
    return next;
  }, []);

  const loadAgentFiles = useCallback(async () => {
    setAgentFilesLoading(true);
    setAgentFilesError(null);
    try {
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        const emptyState = createAgentFilesState();
        savedAgentFilesRef.current = emptyState;
        setAgentFiles(emptyState);
        setAgentFilesDirty(false);
        setAgentFilesError("Agent ID is missing for this agent.");
        return;
      }
      if (!client) {
        setAgentFilesError("Gateway client is not available.");
        return;
      }
      const results = await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const file = await readGatewayAgentFile({ client, agentId: trimmedAgentId, name });
          return { name, content: file.content, exists: file.exists };
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
      savedAgentFilesRef.current = nextState;
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load agent files.";
      setAgentFilesError(message);
    } finally {
      setAgentFilesLoading(false);
    }
  }, [agentId, client]);

  const saveAgentFiles = useCallback(async () => {
    setAgentFilesSaving(true);
    setAgentFilesError(null);
    try {
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        setAgentFilesError("Agent ID is missing for this agent.");
        return false;
      }
      if (!client) {
        setAgentFilesError("Gateway client is not available.");
        return false;
      }
      await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          await writeGatewayAgentFile({
            client,
            agentId: trimmedAgentId,
            name,
            content: agentFiles[name].content,
          });
        })
      );
      const nextState = createAgentFilesState();
      for (const name of AGENT_FILE_NAMES) {
        nextState[name] = {
          content: agentFiles[name].content,
          exists: true,
        };
      }
      savedAgentFilesRef.current = nextState;
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save agent files.";
      setAgentFilesError(message);
      return false;
    } finally {
      setAgentFilesSaving(false);
    }
  }, [agentFiles, agentId, client]);

  const setAgentFileContent = useCallback(
    (value: string) => {
      setAgentFiles((prev) => ({
        ...prev,
        [agentFileTab]: { ...prev[agentFileTab], content: value },
      }));
      setAgentFilesDirty(true);
    },
    [agentFileTab]
  );

  const discardAgentFileChanges = useCallback(() => {
    setAgentFiles(cloneAgentFilesState(savedAgentFilesRef.current));
    setAgentFilesDirty(false);
    setAgentFilesError(null);
  }, [cloneAgentFilesState]);

  const handleAgentFileTabChange = useCallback(
    (nextTab: PersonalityFileName) => {
      if (nextTab === agentFileTab) return;
      if (agentFilesDirty && !agentFilesSaving) {
        const discardConfirmed = window.confirm("Discard changes?");
        if (!discardConfirmed) return;
        discardAgentFileChanges();
      }
      setAgentFileTab(nextTab);
    },
    [agentFileTab, agentFilesDirty, agentFilesSaving, discardAgentFileChanges]
  );

  useEffect(() => {
    void loadAgentFiles();
  }, [loadAgentFiles]);

  useEffect(() => {
    if (!PERSONALITY_FILE_NAMES.includes(agentFileTab)) {
      setAgentFileTab(PERSONALITY_FILE_NAMES[0]);
    }
  }, [agentFileTab]);

  return {
    agentFiles,
    agentFileTab,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
    saveAgentFiles,
    discardAgentFileChanges,
  };
};

export const AgentBrainPanel = ({
  client,
  agents,
  selectedAgentId,
  onUnsavedChangesChange,
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
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
    saveAgentFiles,
    discardAgentFileChanges,
  } = useAgentFilesEditor({ client, agentId: selectedAgent?.agentId ?? null });
  const [previewMode, setPreviewMode] = useState(true);

  const handleTabChange = useCallback(
    (nextTab: PersonalityFileName) => {
      handleAgentFileTabChange(nextTab);
    },
    [handleAgentFileTabChange]
  );

  const handleEnterEditMode = useCallback(() => {
    if (agentFilesLoading || agentFilesSaving) return;
    setPreviewMode(false);
  }, [agentFilesLoading, agentFilesSaving]);

  const handleCancelEditMode = useCallback(() => {
    if (agentFilesLoading || agentFilesSaving) return;
    discardAgentFileChanges();
    setPreviewMode(true);
  }, [agentFilesLoading, agentFilesSaving, discardAgentFileChanges]);

  const handleSaveEditMode = useCallback(async () => {
    if (agentFilesLoading || agentFilesSaving) return;
    const saved = await saveAgentFiles();
    if (!saved) return;
    setPreviewMode(true);
  }, [agentFilesLoading, agentFilesSaving, saveAgentFiles]);

  const statusLine = agentFilesLoading
    ? "Loading files..."
    : agentFilesSaving
      ? "Saving changes..."
      : agentFilesDirty
        ? "Unsaved changes"
        : "All changes saved";

  useEffect(() => {
    onUnsavedChangesChange?.(agentFilesDirty);
  }, [agentFilesDirty, onUnsavedChangesChange]);

  useEffect(() => {
    return () => {
      onUnsavedChangesChange?.(false);
    };
  }, [onUnsavedChangesChange]);

  return (
    <div
      className="agent-inspect-panel flex min-h-0 flex-col overflow-hidden"
      data-testid="agent-personality-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <div className="flex min-h-0 flex-1 flex-col p-4 pt-0">
        <section className="flex min-h-0 flex-1 flex-col" data-testid="agent-personality-files">
          {agentFilesError ? (
            <div className="ui-alert-danger mt-2 rounded-md px-3 py-2 text-xs">
              {agentFilesError}
            </div>
          ) : null}

          <div className="ui-segment grid grid-cols-3 sm:grid-cols-4">
            {PERSONALITY_FILE_NAMES.map((name) => {
              const active = name === agentFileTab;
              return (
                <button
                  key={name}
                  type="button"
                  className="ui-segment-item px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.06em]"
                  data-active={active ? "true" : "false"}
                  onClick={() => {
                    handleTabChange(name);
                  }}
                >
                  {PERSONALITY_FILE_LABELS[name]}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-end gap-1">
            {previewMode ? (
              <button
                type="button"
                className="ui-btn-primary px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                disabled={agentFilesLoading || agentFilesSaving}
                onClick={handleEnterEditMode}
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="ui-btn-primary px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                  disabled={agentFilesLoading || agentFilesSaving || !agentFilesDirty}
                  onClick={() => {
                    void handleSaveEditMode();
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="ui-btn-secondary px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] disabled:opacity-50"
                  disabled={agentFilesLoading || agentFilesSaving}
                  onClick={handleCancelEditMode}
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          <div className="mt-3 min-h-0 flex-1 rounded-lg bg-muted/30 p-3">
            {previewMode ? (
              <div className="agent-markdown h-full overflow-y-auto rounded-lg bg-background/80 px-4 py-3 text-xs leading-7 text-foreground shadow-2xs">
                {agentFiles[agentFileTab].content.trim().length === 0 ? (
                  <p className="text-muted-foreground">
                    {AGENT_FILE_PLACEHOLDERS[agentFileTab]}
                  </p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {agentFiles[agentFileTab].content}
                  </ReactMarkdown>
                )}
              </div>
            ) : (
              <textarea
                className="h-full min-h-0 w-full resize-none overflow-y-auto rounded-lg border border-border/80 bg-background/80 px-4 py-3 font-mono text-xs leading-7 text-foreground outline-none"
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
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">{statusLine}</div>
          </div>
        </section>
      </div>
    </div>
  );
};
