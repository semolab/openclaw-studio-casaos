# OpenClaw Studio for CasaOS

This folder contains a CasaOS-ready deployment for OpenClaw Studio.

## 1) Use in CasaOS Custom Install

Paste `deploy/casaos/docker-compose.yml` into CasaOS Custom Install.

Set at least:

- `OPENCLAW_STUDIO_IMAGE`
- `STUDIO_ACCESS_TOKEN`

Recommended image tag format:

```text
ghcr.io/semolab/openclaw-studio-casaos:studio-YYYY.M.D-amd64
```

## 2) First access

When `HOST=0.0.0.0`, Studio requires access token bootstrap.

Open once:

```text
http://<CASAOS_IP>:3000/?access_token=<STUDIO_ACCESS_TOKEN>
```

Then use:

```text
http://<CASAOS_IP>:3000
```

## 3) Volume

Persistent data path:

- `/DATA/AppData/openclaw-studio/data:/data`

## 4) Build and publish (manual)

Current upstream snapshot may fail on `next build` in CI due a root page prerender issue.
This Docker setup runs Studio in server dev mode (`server/index.js --dev`) for reliability on CasaOS.

```bash
docker build -t ghcr.io/semolab/openclaw-studio-casaos:studio-2026.3.9-amd64 .
docker push ghcr.io/semolab/openclaw-studio-casaos:studio-2026.3.9-amd64
```
