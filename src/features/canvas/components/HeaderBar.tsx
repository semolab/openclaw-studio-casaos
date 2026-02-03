import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { ThemeToggle } from "@/components/theme-toggle";

export type StudioViewMode = "focused" | "canvas";

type HeaderBarProps = {
  status: GatewayStatus;
  gatewayUrl: string;
  agentCount: number;
  onConnectionSettings: () => void;
  viewMode: StudioViewMode;
  onViewModeChange: (mode: StudioViewMode) => void;
};

const statusDotStyles: Record<GatewayStatus, string> = {
  disconnected: "bg-muted",
  connecting: "bg-secondary",
  connected: "bg-primary",
};

const statusLabel: Record<GatewayStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
};

export const HeaderBar = ({
  status,
  gatewayUrl,
  agentCount,
  onConnectionSettings,
  viewMode,
  onViewModeChange,
}: HeaderBarProps) => {
  return (
    <div className="glass-panel px-6 py-4">
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            Agents ({agentCount})
          </p>
          {gatewayUrl ? (
            <p className="truncate text-xs text-muted-foreground">{gatewayUrl}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${statusDotStyles[status]}`}
              aria-hidden="true"
            />
            {statusLabel[status]}
          </div>
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              data-testid="view-mode-focused"
              aria-pressed={viewMode === "focused"}
              className={`rounded-md px-3 py-1 text-xs font-semibold uppercase transition ${
                viewMode === "focused"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card"
              }`}
              onClick={() => onViewModeChange("focused")}
            >
              Focused
            </button>
            <button
              type="button"
              data-testid="view-mode-canvas"
              aria-pressed={viewMode === "canvas"}
              className={`rounded-md px-3 py-1 text-xs font-semibold uppercase transition ${
                viewMode === "canvas"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card"
              }`}
              onClick={() => onViewModeChange("canvas")}
            >
              Canvas
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:border-ring"
              type="button"
              onClick={onConnectionSettings}
              data-testid="gateway-settings-toggle"
            >
              Connection Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
