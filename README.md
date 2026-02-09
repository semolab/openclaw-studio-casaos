![Home screen](home-screen.png)

# OpenClaw Studio

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/VEpdKJ9e)

OpenClaw Studio is a Next.js UI for managing OpenClaw agents via the OpenClaw Gateway (WebSocket).

## Requirements

- Node.js 18+ (LTS recommended)
- OpenClaw Gateway running (local or remote)
- macOS or Linux; Windows via WSL2

## Quick start
### Install Studio (recommended)
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

### Local vs remote

Local gateway (same machine):
- Gateway URL: `ws://127.0.0.1:18789`
- Token: `openclaw config get gateway.auth.token`

Remote gateway (EC2/Tailscale/etc.):
- Set the gateway URL + token in Studio Settings, or install with:
```bash
npx -y openclaw-studio --gateway-url wss://your-host:18789 --gateway-token <token>
```
- Sanity-check reachability:
```bash
openclaw gateway probe --url wss://your-host:18789 --token <token>
```
- If you prefer SSH tunneling:
```bash
ssh -L 18789:127.0.0.1:18789 user@your-host
```
Then connect Studio to `ws://127.0.0.1:18789`.

### Install (manual)
```bash
git clone https://github.com/grp06/openclaw-studio.git
cd openclaw-studio
npm install
npm run dev
```

Open http://localhost:3000

## Configuration

Paths and key settings:
- OpenClaw config: `~/.openclaw/openclaw.json` (or `OPENCLAW_CONFIG_PATH` / `OPENCLAW_STATE_DIR`)
- Studio settings: `~/.openclaw/openclaw-studio/settings.json`
- Default gateway URL: `ws://127.0.0.1:18789` (override via Studio Settings or `NEXT_PUBLIC_GATEWAY_URL`)

## Troubleshooting

- **Missing config**: Run `openclaw onboard` or set `OPENCLAW_CONFIG_PATH`
- **Gateway unreachable**: Confirm the gateway is running and `NEXT_PUBLIC_GATEWAY_URL` matches
- **Auth errors**: Studio currently prompts for a token. Check `gateway.auth.mode` is `token` and `gateway.auth.token` is set in `openclaw.json` (or run `openclaw config get gateway.auth.token`).
- **Brain files fail to load**: Confirm Studio is connected, and your gateway supports `agents.files.get` / `agents.files.set`.
- **Still stuck**: Run `npx -y openclaw-studio@latest doctor --check` (and `--fix --force-settings` to safely rewrite Studio settings).

## Architecture

See `ARCHITECTURE.md` for details on modules and data flow.
