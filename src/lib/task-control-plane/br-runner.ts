import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  extractJsonErrorMessage,
  parseJsonOutput,
  resolveGatewaySshTarget,
} from "@/lib/ssh/gateway-host";

type RunBrJsonOptions = {
  cwd?: string;
  env?: Record<string, string>;
};

const runBrJsonLocal = (command: string[], options?: RunBrJsonOptions): unknown => {
  const args = [...command, "--json"];
  const result = childProcess.spawnSync("br", args, {
    cwd: options?.cwd,
    env: { ...process.env, ...(options?.env ?? {}) },
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`Failed to execute br: ${result.error.message}`);
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const stderrText = stderr.trim();
    const stdoutText = stdout.trim();
    const message =
      extractJsonErrorMessage(stdout) ??
      extractJsonErrorMessage(stderr) ??
      (stderrText || stdoutText || `Command failed: br ${args.join(" ")}`);
    throw new Error(message);
  }
  return parseJsonOutput(stdout, `br ${command.join(" ")} --json`);
};

const quoteShellArg = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

const runBrJsonViaSsh = (command: string[], options: { sshTarget: string; cwd: string }) => {
  const remote =
    `cd ${quoteShellArg(options.cwd)} && ` +
    `PATH=\"$HOME/.local/bin:$HOME/.cargo/bin:$PATH\" ` +
    `br ${command.join(" ")} --json`;
  const result = childProcess.spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", options.sshTarget, remote],
    { encoding: "utf8" }
  );
  if (result.error) {
    throw new Error(`Failed to execute ssh: ${result.error.message}`);
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const stderrText = stderr.trim();
    const stdoutText = stdout.trim();
    const message =
      extractJsonErrorMessage(stdout) ??
      extractJsonErrorMessage(stderr) ??
      (stderrText || stdoutText || `Command failed: ssh ${options.sshTarget} <br>`);
    throw new Error(message);
  }
  return parseJsonOutput(stdout, `br ${command.join(" ")} --json`);
};

const parseScopePath = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const path = (value as Record<string, unknown>).path;
  return typeof path === "string" && path.trim().length > 0 ? path : null;
};

const BEADS_DIR_ENV = "OPENCLAW_TASK_CONTROL_PLANE_BEADS_DIR";
const GATEWAY_BEADS_DIR_ENV = "OPENCLAW_TASK_CONTROL_PLANE_GATEWAY_BEADS_DIR";

const resolveTaskControlPlaneCwd = (): string | undefined => {
  const configured = process.env[BEADS_DIR_ENV];
  if (!configured) return undefined;
  const trimmed = configured.trim();
  if (!trimmed) return undefined;

  if (path.basename(trimmed) !== ".beads") {
    throw new Error(
      `${BEADS_DIR_ENV} must be an absolute path to a ".beads" directory (got: ${trimmed}).`
    );
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(trimmed);
  } catch {
    throw new Error(`${BEADS_DIR_ENV} does not exist on this host: ${trimmed}.`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`${BEADS_DIR_ENV} must point to a directory (got file): ${trimmed}.`);
  }

  return path.dirname(trimmed);
};

const resolveGatewayBeadsDir = (): string | undefined => {
  const configured = process.env[GATEWAY_BEADS_DIR_ENV];
  if (!configured) return undefined;
  const trimmed = configured.trim();
  if (!trimmed) return undefined;

  if (!path.isAbsolute(trimmed) || path.basename(trimmed) !== ".beads") {
    throw new Error(
      `${GATEWAY_BEADS_DIR_ENV} must be an absolute path to a ".beads" directory on the gateway host (got: ${trimmed}).`
    );
  }

  return trimmed;
};

export const isBeadsWorkspaceError = (message: string) => {
  const lowered = message.toLowerCase();
  return lowered.includes("no beads directory found") || lowered.includes("not initialized");
};

export const createTaskControlPlaneBrRunner = (): {
  runBrJson: (command: string[]) => unknown;
  parseScopePath: (value: unknown) => string | null;
} => {
  const gatewayBeadsDir = resolveGatewayBeadsDir();
  if (gatewayBeadsDir) {
    const sshTarget = resolveGatewaySshTarget();
    const cwd = path.dirname(gatewayBeadsDir);
    return {
      runBrJson: (command) => runBrJsonViaSsh(command, { sshTarget, cwd }),
      parseScopePath,
    };
  }
  const cwd = resolveTaskControlPlaneCwd();
  return {
    runBrJson: (command) => runBrJsonLocal(command, { cwd }),
    parseScopePath,
  };
};
