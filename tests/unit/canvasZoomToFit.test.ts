import { describe, expect, it } from "vitest";

import { worldToScreen, zoomToFit } from "@/features/canvas/lib/transform";
import type { AgentTile } from "@/features/canvas/state/store";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const makeTile = (
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number }
): AgentTile => ({
  agentId: `agent-${id}`,
  name: `Tile ${id}`,
  sessionKey: `agent:agent-${id}:main`,
  position,
  size,
  avatarSeed: `agent-${id}`,
  avatarUrl: null,
  model: null,
  thinkingLevel: "low",
  status: "idle",
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  sessionSettingsSynced: false,
  historyLoadedAt: null,
  toolCallingEnabled: true,
  showThinkingTraces: true,
});

const getBounds = (tiles: AgentTile[]): Bounds => {
  const minX = Math.min(...tiles.map((tile) => tile.position.x));
  const minY = Math.min(...tiles.map((tile) => tile.position.y));
  const maxX = Math.max(
    ...tiles.map((tile) => tile.position.x + tile.size.width)
  );
  const maxY = Math.max(
    ...tiles.map((tile) => tile.position.y + tile.size.height)
  );
  return { minX, minY, maxX, maxY };
};

describe("zoomToFit", () => {
  it("fits tile bounds within the viewport with padding", () => {
    const tiles = [
      makeTile("1", { x: 120, y: 80 }, { width: 400, height: 300 }),
      makeTile("2", { x: 700, y: 500 }, { width: 240, height: 200 }),
    ];
    const viewportSize = { width: 1200, height: 800 };
    const padding = 60;
    const currentTransform = { zoom: 1, offsetX: 0, offsetY: 0 };

    const transform = zoomToFit(tiles, viewportSize, padding, currentTransform);
    const bounds = getBounds(tiles);
    const topLeft = worldToScreen(transform, { x: bounds.minX, y: bounds.minY });
    const bottomRight = worldToScreen(transform, {
      x: bounds.maxX,
      y: bounds.maxY,
    });

    expect(topLeft.x).toBeGreaterThanOrEqual(padding - 0.5);
    expect(topLeft.y).toBeGreaterThanOrEqual(padding - 0.5);
    expect(bottomRight.x).toBeLessThanOrEqual(viewportSize.width - padding + 0.5);
    expect(bottomRight.y).toBeLessThanOrEqual(viewportSize.height - padding + 0.5);
  });

  it("returns the current transform when there are no tiles", () => {
    const currentTransform = { zoom: 1.2, offsetX: 40, offsetY: -20 };
    const viewportSize = { width: 900, height: 700 };

    expect(zoomToFit([], viewportSize, 40, currentTransform)).toEqual(currentTransform);
  });
});
