import type { AgentTile, FocusFilter } from "@/features/canvas/state/store";
import { getAttentionForAgent } from "@/features/canvas/state/store";
import { AgentAvatar } from "./AgentAvatar";

type FleetSidebarProps = {
  agents: AgentTile[];
  selectedAgentId: string | null;
  filter: FocusFilter;
  onFilterChange: (next: FocusFilter) => void;
  onSelectAgent: (agentId: string) => void;
};

const FILTER_OPTIONS: Array<{ value: FocusFilter; label: string; testId: string }> = [
  { value: "all", label: "All", testId: "fleet-filter-all" },
  {
    value: "needs-attention",
    label: "Needs Attention",
    testId: "fleet-filter-needs-attention",
  },
  { value: "running", label: "Running", testId: "fleet-filter-running" },
  { value: "idle", label: "Idle", testId: "fleet-filter-idle" },
];

const statusLabel: Record<AgentTile["status"], string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
};

const statusClassName: Record<AgentTile["status"], string> = {
  idle: "bg-accent text-accent-foreground border border-border",
  running: "bg-primary text-primary-foreground",
  error: "bg-destructive text-destructive-foreground",
};

export const FleetSidebar = ({
  agents,
  selectedAgentId,
  filter,
  onFilterChange,
  onSelectAgent,
}: FleetSidebarProps) => {
  return (
    <aside
      className="glass-panel flex h-full w-full max-w-sm min-w-72 flex-col gap-3 p-3"
      data-testid="fleet-sidebar"
    >
      <div className="px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fleet
        </p>
        <p className="text-sm font-semibold text-foreground">Agents ({agents.length})</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={option.testId}
              aria-pressed={active}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-card"
              }`}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            No agents available.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.agentId;
              const attention = getAttentionForAgent(agent, selectedAgentId);
              const avatarSeed = agent.avatarSeed ?? agent.agentId;
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  data-testid={`fleet-agent-row-${agent.agentId}`}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-card"
                  }`}
                  onClick={() => onSelectAgent(agent.agentId)}
                >
                  <AgentAvatar
                    seed={avatarSeed}
                    name={agent.name}
                    avatarUrl={agent.avatarUrl ?? null}
                    size={28}
                    isSelected={selected}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
                      {agent.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusClassName[agent.status]}`}
                      >
                        {statusLabel[agent.status]}
                      </span>
                      {attention === "needs-attention" ? (
                        <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          Attention
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
