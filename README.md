![Home screen](home-screen.png)

# OpenClaw Studio

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/VEpdKJ9e)

When you run multiple agents, you need a place to see what's happening.

OpenClaw Studio is that place. It's the visual interface for the OpenClaw ecosystem—designed for people who coordinate agents, track long-running tasks, and need to stay oriented when the work gets complex.

Join the Discord: [https://discord.gg/VEpdKJ9e](https://discord.gg/VEpdKJ9e). I'm also looking for contributors who want to help shape OpenClaw Studio.

The terminal is good for single commands. But agents don't work in single commands. They work in threads. They share context. They produce files that evolve. They run in parallel, and you need to know what's running where.

OpenClaw Studio solves this. It's a Next.js app that connects to your OpenClaw gateway, streams everything live, and edits agent files through the gateway tool API. The interface is simple enough to feel obvious, powerful enough to handle real work.

## What it does

- Shows you every agent at a glance
- Runs a focused agent-management UI (fleet list + primary agent + inspect sidebar)
- Creates new agents directly from the fleet sidebar (`New Agent`)
- Lets you change per-agent runtime model/thinking directly from the agent header
- Lets you stop an in-flight run from the chat panel (`chat.abort`)
- Keeps per-agent management actions in settings (rename, display toggles, new session, delete)
- Lists per-agent cron jobs in settings and lets you run now or delete
- Reads and edits agent files (AGENTS.md, MEMORY.md, etc.) via the gateway
- Streams tool output in real time
- Stores only UI settings locally—no external database

This is where multi-agent work happens.

## Requirements

- Node.js 18+ (LTS recommended)
- OpenClaw Gateway running (Studio connects over WebSocket)
- macOS or Linux; Windows via WSL2

## Quick start
### Install (recommended)
```bash
npx -y openclaw-studio
cd openclaw-studio
npm run dev
```

What the installer does:
- Downloads OpenClaw Studio into `./openclaw-studio`
- Installs dependencies
- Prints a preflight checklist so it's obvious if you're missing npm/OpenClaw config or a reachable gateway
- Writes Studio connection settings under your OpenClaw state dir (for example `~/.openclaw/openclaw-studio/settings.json`) when possible, so the Gateway URL/token are pre-filled

### Start the gateway (required)

If you don't already have OpenClaw installed:
```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

Start a local gateway (foreground):
```bash
openclaw gateway run --bind loopback --port 18789 --verbose
```

Helpful checks:
```bash
openclaw gateway probe
openclaw config get gateway.auth.token
```

Remote gateway notes:
- If your gateway runs on another machine (EC2/Tailscale), set the WebSocket URL + token in Studio Settings, or run the installer with `--gateway-url` / `--gateway-token`.
- You can also sanity-check remote reachability with: `openclaw gateway probe --url wss://your-host:18789 --token <token>`.

### Install (manual)
```bash
git clone https://github.com/grp06/openclaw-studio.git
cd openclaw-studio
npm install
npm run dev
```

Open http://localhost:3000

The UI reads config from `~/.openclaw` by default (falls back to `~/.moltbot` or `~/.clawdbot` if you're migrating).
Only create a `.env` if you need to override those defaults:
```bash
cp .env.example .env
```

## Agent files

Agent files live on the **gateway host** (per-agent workspace) and are managed through Gateway WebSocket methods:

- `agents.files.list`
- `agents.files.get`
- `agents.files.set`

## Configuration

Your gateway config lives in `openclaw.json` in your state directory. Defaults:
- State dir: `~/.openclaw`
- Config: `~/.openclaw/openclaw.json`
- Gateway URL: `ws://127.0.0.1:18789`

Studio stores its own settings locally at `~/.openclaw/openclaw-studio/settings.json` (gateway URL/token + focused preferences).
Agent create/rename/delete actions in Studio mutate gateway config through `config.patch`, so `openclaw.json` is updated on the **gateway host** (local machine for local gateways, remote host for EC2/remote gateways).
When deleting an agent, Studio also attempts to move the agent's workspace/state on the gateway host into `~/.openclaw/trash` over SSH (so remote gateways don't accumulate orphan `workspace-*` / `agents/*` directories).

Optional overrides:
- `OPENCLAW_STATE_DIR`
- `OPENCLAW_CONFIG_PATH`
- `NEXT_PUBLIC_GATEWAY_URL`
- `CLAWDBOT_DEFAULT_AGENT_ID`
- `OPENCLAW_TASK_CONTROL_PLANE_BEADS_DIR` (local `.beads` directory for `/control-plane`)
- `OPENCLAW_TASK_CONTROL_PLANE_GATEWAY_BEADS_DIR` (gateway-host `.beads` directory for `/control-plane`; runs `br` over SSH)
- `OPENCLAW_TASK_CONTROL_PLANE_SSH_TARGET` (optional override for SSH target)
- `OPENCLAW_TASK_CONTROL_PLANE_SSH_USER` (optional SSH user when deriving target from gateway URL)

## Viewing Beads From An EC2 Gateway

If your gateway is running on EC2 but Studio is running locally, you can point the Task Control Plane at the EC2 `.beads` workspace. Studio will fetch Beads status by running `br ... --json` on the gateway host over SSH.

1. Connect Studio to your EC2 gateway (Settings in the UI, or set `NEXT_PUBLIC_GATEWAY_URL`).
2. Confirm you can SSH to the EC2 host from your laptop without prompts (SSH keys and host key already accepted):
   - Example: `ssh ubuntu@your-ec2-host 'br --version'`
3. In `.env.local` (or `.env`), set:
   - `OPENCLAW_TASK_CONTROL_PLANE_GATEWAY_BEADS_DIR=/home/ubuntu/repos/openclaw-studio-base/.beads`
   - Optional: `OPENCLAW_TASK_CONTROL_PLANE_SSH_TARGET=ubuntu@your-ec2-host` (if Studio can't derive the SSH host from the configured gateway URL)
4. Restart `npm run dev`.
5. Open http://localhost:3000/control-plane (the JSON endpoint is http://localhost:3000/api/task-control-plane).

To use a dedicated state dir during development:
```bash
OPENCLAW_STATE_DIR=~/openclaw-dev npm run dev
```

## Windows (WSL2)

Run both OpenClaw Studio and OpenClaw inside the same WSL2 distro. Use the WSL shell for Node, the gateway, and the UI. Access it from Windows at http://localhost:3000.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run e2e` (requires `npx playwright install`)

## Troubleshooting

- **Missing config**: Run `openclaw onboard` or set `OPENCLAW_CONFIG_PATH`
- **Gateway unreachable**: Confirm the gateway is running and `NEXT_PUBLIC_GATEWAY_URL` matches
- **Auth errors**: Studio currently prompts for a token. Check `gateway.auth.mode` is `token` and `gateway.auth.token` is set in `openclaw.json` (or run `openclaw config get gateway.auth.token`).
- **Brain files fail to load**: Confirm Studio is connected, and your gateway supports `agents.files.get` / `agents.files.set` (update OpenClaw if those methods are missing).
- **Remote delete fails**: Studio deletes agents by moving their workspace/state into `~/.openclaw/trash` on the gateway host over SSH (must be able to `ssh` non-interactively). Use `OPENCLAW_TASK_CONTROL_PLANE_SSH_TARGET` if Studio can't derive the host from the gateway URL.

## Architecture

See `ARCHITECTURE.md` for details on modules and data flow.
