import { beforeEach, describe, expect, it, vi } from "vitest";

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { GET } from "@/app/api/task-control-plane/route";
import { buildTaskControlPlaneSnapshot } from "@/lib/task-control-plane/read-model";

const ORIGINAL_ENV = { ...process.env };

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process"
  );
  return {
    default: actual,
    ...actual,
    spawnSync: vi.fn(),
  };
});

vi.mock("@/lib/task-control-plane/read-model", () => ({
  buildTaskControlPlaneSnapshot: vi.fn(),
}));

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedBuildSnapshot = vi.mocked(buildTaskControlPlaneSnapshot);
const mockedConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

describe("task control plane route", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OPENCLAW_TASK_CONTROL_PLANE_BEADS_DIR;
    delete process.env.OPENCLAW_TASK_CONTROL_PLANE_GATEWAY_BEADS_DIR;
    delete process.env.OPENCLAW_TASK_CONTROL_PLANE_SSH_TARGET;
    delete process.env.OPENCLAW_TASK_CONTROL_PLANE_SSH_USER;
    delete process.env.OPENCLAW_STATE_DIR;
    mockedSpawnSync.mockReset();
    mockedBuildSnapshot.mockReset();
    mockedConsoleError.mockClear();
  });

  it("returns snapshot on success", async () => {
    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ path: "/tmp/.beads" }),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-1" }]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-2" }]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-3" }]),
        stderr: "",
        error: undefined,
      } as never);

    mockedBuildSnapshot.mockReturnValue({
      generatedAt: "2026-02-05T00:00:00.000Z",
      scopePath: "/tmp/.beads",
      columns: { ready: [], inProgress: [], blocked: [] },
      warnings: [],
    });

    const response = await GET();
    const body = (await response.json()) as { snapshot: unknown };

    expect(response.status).toBe(200);
    expect(body.snapshot).toBeDefined();
    expect(mockedSpawnSync).toHaveBeenCalledTimes(4);
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1,
      "br",
      ["where", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2,
      "br",
      ["list", "--status", "open", "--limit", "0", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      3,
      "br",
      ["list", "--status", "in_progress", "--limit", "0", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      4,
      "br",
      ["blocked", "--limit", "0", "--json"],
      expect.objectContaining({ encoding: "utf8" })
    );
    expect(mockedBuildSnapshot).toHaveBeenCalledWith({
      scopePath: "/tmp/.beads",
      openIssues: [{ id: "bd-1" }],
      inProgressIssues: [{ id: "bd-2" }],
      blockedIssues: [{ id: "bd-3" }],
    });
  });

  it("runs br from configured beads scope", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-control-plane-"));
    const beadsDir = path.join(tempRoot, ".beads");
    fs.mkdirSync(beadsDir);

    process.env.OPENCLAW_TASK_CONTROL_PLANE_BEADS_DIR = beadsDir;

    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ path: beadsDir }),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([]),
        stderr: "",
        error: undefined,
      } as never);

    mockedBuildSnapshot.mockReturnValue({
      generatedAt: "2026-02-05T00:00:00.000Z",
      scopePath: beadsDir,
      columns: { ready: [], inProgress: [], blocked: [] },
      warnings: [],
    });

    await GET();

    expect(mockedSpawnSync).toHaveBeenCalledTimes(4);
    for (const call of mockedSpawnSync.mock.calls) {
      const options = call[2] as { cwd?: string };
      expect(options.cwd).toBe(tempRoot);
    }
  });

  it("loads snapshot via ssh when configured", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-state-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const settingsDir = path.join(stateDir, "openclaw-studio");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "settings.json"),
      JSON.stringify(
        {
          version: 1,
          gateway: { url: "ws://example.test:18789", token: "token-123" },
          focused: {},
        },
        null,
        2
      ),
      "utf8"
    );

    process.env.OPENCLAW_TASK_CONTROL_PLANE_GATEWAY_BEADS_DIR = "/home/ubuntu/repo/.beads";

    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ path: "/home/ubuntu/repo/.beads" }),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-1" }]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-2" }]),
        stderr: "",
        error: undefined,
      } as never)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ id: "bd-3" }]),
        stderr: "",
        error: undefined,
      } as never);

    mockedBuildSnapshot.mockReturnValue({
      generatedAt: "2026-02-05T00:00:00.000Z",
      scopePath: "/home/ubuntu/repo/.beads",
      columns: { ready: [], inProgress: [], blocked: [] },
      warnings: [],
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(mockedSpawnSync).toHaveBeenCalledTimes(4);
    for (const call of mockedSpawnSync.mock.calls) {
      expect(call[0]).toBe("ssh");
    }
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1,
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "ubuntu@example.test",
        "cd '/home/ubuntu/repo' && PATH=\"$HOME/.local/bin:$HOME/.cargo/bin:$PATH\" br where --json",
      ],
      expect.objectContaining({ encoding: "utf8" })
    );
  });

  it("returns 400 for missing beads workspace", async () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: JSON.stringify({ error: "no beads directory found" }),
      stderr: "",
      error: undefined,
    } as never);

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("Beads workspace not initialized");
    expect(mockedConsoleError).toHaveBeenCalled();
  });

  it("returns 502 for other failures", async () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: JSON.stringify({ error: "boom" }),
      stderr: "",
      error: undefined,
    } as never);

    const response = await GET();
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("boom");
    expect(mockedConsoleError).toHaveBeenCalledWith("boom");
  });
});
