"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import { CANVAS_BASE_ZOOM } from "@/lib/canvasDefaults";
import { MAX_TILE_HEIGHT, MIN_TILE_SIZE } from "@/lib/canvasTileDefaults";

export type AgentStatus = "idle" | "running" | "error";

export type TilePosition = { x: number; y: number };
export type TileSize = { width: number; height: number };

export type AgentSeed = {
  agentId: string;
  name: string;
  sessionKey: string;
  position: TilePosition;
  size: TileSize;
  avatarSeed?: string | null;
  avatarUrl?: string | null;
  model?: string | null;
  thinkingLevel?: string | null;
  toolCallingEnabled?: boolean;
  showThinkingTraces?: boolean;
};

export type AgentTile = AgentSeed & {
  status: AgentStatus;
  outputLines: string[];
  lastResult: string | null;
  lastDiff: string | null;
  runId: string | null;
  streamText: string | null;
  thinkingTrace: string | null;
  latestOverride: string | null;
  latestOverrideKind: "heartbeat" | "cron" | null;
  lastActivityAt: number | null;
  latestPreview: string | null;
  lastUserMessage: string | null;
  draft: string;
  sessionSettingsSynced: boolean;
  historyLoadedAt: number | null;
  toolCallingEnabled: boolean;
  showThinkingTraces: boolean;
};

export type CanvasTransform = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type CanvasState = {
  agents: AgentTile[];
  selectedAgentId: string | null;
  canvas: CanvasTransform;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: "hydrateAgents"; agents: AgentSeed[] }
  | { type: "setError"; error: string | null }
  | { type: "setLoading"; loading: boolean }
  | { type: "updateAgent"; agentId: string; patch: Partial<AgentTile> }
  | { type: "appendOutput"; agentId: string; line: string }
  | { type: "setStream"; agentId: string; value: string | null }
  | { type: "selectAgent"; agentId: string | null }
  | { type: "setCanvas"; patch: Partial<CanvasTransform> };

const initialState: CanvasState = {
  agents: [],
  selectedAgentId: null,
  canvas: { zoom: CANVAS_BASE_ZOOM, offsetX: 0, offsetY: 0 },
  loading: true,
  error: null,
};

const clampTileHeight = (height: number) =>
  Math.min(MAX_TILE_HEIGHT, Math.max(MIN_TILE_SIZE.height, height));

const clampTileWidth = (width: number) => Math.max(MIN_TILE_SIZE.width, width);

const clampTileSize = (size: TileSize): TileSize => ({
  width: clampTileWidth(size.width),
  height: clampTileHeight(size.height),
});

const createRuntimeAgent = (seed: AgentSeed, existing?: AgentTile | null): AgentTile => {
  const size = clampTileSize(seed.size);
  return {
    ...seed,
    size,
    avatarSeed: seed.avatarSeed ?? existing?.avatarSeed ?? seed.agentId,
    avatarUrl: seed.avatarUrl ?? existing?.avatarUrl ?? null,
    model: seed.model ?? existing?.model ?? null,
    thinkingLevel: seed.thinkingLevel ?? existing?.thinkingLevel ?? "medium",
    status: existing?.status ?? "idle",
    outputLines: existing?.outputLines ?? [],
    lastResult: existing?.lastResult ?? null,
    lastDiff: existing?.lastDiff ?? null,
    runId: existing?.runId ?? null,
    streamText: existing?.streamText ?? null,
    thinkingTrace: existing?.thinkingTrace ?? null,
    latestOverride: existing?.latestOverride ?? null,
    latestOverrideKind: existing?.latestOverrideKind ?? null,
    lastActivityAt: existing?.lastActivityAt ?? null,
    latestPreview: existing?.latestPreview ?? null,
    lastUserMessage: existing?.lastUserMessage ?? null,
    draft: existing?.draft ?? "",
    sessionSettingsSynced: existing?.sessionSettingsSynced ?? false,
    historyLoadedAt: existing?.historyLoadedAt ?? null,
    toolCallingEnabled: seed.toolCallingEnabled ?? existing?.toolCallingEnabled ?? true,
    showThinkingTraces: seed.showThinkingTraces ?? existing?.showThinkingTraces ?? true,
  };
};

const reducer = (state: CanvasState, action: Action): CanvasState => {
  switch (action.type) {
    case "hydrateAgents": {
      const byId = new Map(state.agents.map((agent) => [agent.agentId, agent]));
      const agents = action.agents.map((seed) =>
        createRuntimeAgent(seed, byId.get(seed.agentId))
      );
      const selectedAgentId =
        state.selectedAgentId && agents.some((agent) => agent.agentId === state.selectedAgentId)
          ? state.selectedAgentId
          : agents[0]?.agentId ?? null;
      return {
        ...state,
        agents,
        selectedAgentId,
        loading: false,
        error: null,
      };
    }
    case "setError":
      return { ...state, error: action.error, loading: false };
    case "setLoading":
      return { ...state, loading: action.loading };
    case "updateAgent":
      return {
        ...state,
        agents: state.agents.map((agent) =>
          agent.agentId === action.agentId
            ? {
                ...agent,
                ...action.patch,
                size: action.patch.size ? clampTileSize(action.patch.size) : agent.size,
              }
            : agent
        ),
      };
    case "appendOutput":
      return {
        ...state,
        agents: state.agents.map((agent) =>
          agent.agentId === action.agentId
            ? { ...agent, outputLines: [...agent.outputLines, action.line] }
            : agent
        ),
      };
    case "setStream":
      return {
        ...state,
        agents: state.agents.map((agent) =>
          agent.agentId === action.agentId
            ? { ...agent, streamText: action.value }
            : agent
        ),
      };
    case "selectAgent":
      return { ...state, selectedAgentId: action.agentId };
    case "setCanvas":
      return { ...state, canvas: { ...state.canvas, ...action.patch } };
    default:
      return state;
  }
};

export const agentCanvasReducer = reducer;
export const initialAgentCanvasState = initialState;

type AgentCanvasContextValue = {
  state: CanvasState;
  dispatch: React.Dispatch<Action>;
  hydrateAgents: (agents: AgentSeed[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

const AgentCanvasContext = createContext<AgentCanvasContextValue | null>(null);

export const AgentCanvasProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const hydrateAgents = useCallback(
    (agents: AgentSeed[]) => {
      dispatch({ type: "hydrateAgents", agents });
    },
    [dispatch]
  );

  const setLoading = useCallback(
    (loading: boolean) => dispatch({ type: "setLoading", loading }),
    [dispatch]
  );

  const setError = useCallback(
    (error: string | null) => dispatch({ type: "setError", error }),
    [dispatch]
  );

  const value = useMemo(
    () => ({ state, dispatch, hydrateAgents, setLoading, setError }),
    [dispatch, hydrateAgents, setError, setLoading, state]
  );

  return (
    <AgentCanvasContext.Provider value={value}>{children}</AgentCanvasContext.Provider>
  );
};

export const useAgentCanvasStore = () => {
  const ctx = useContext(AgentCanvasContext);
  if (!ctx) {
    throw new Error("AgentCanvasProvider is missing.");
  }
  return ctx;
};

export const getSelectedAgent = (state: CanvasState): AgentTile | null => {
  if (!state.selectedAgentId) return null;
  return state.agents.find((agent) => agent.agentId === state.selectedAgentId) ?? null;
};
