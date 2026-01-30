# Contributing

Thanks for helping improve clawdbot-agent-ui. Please use GitHub Issues for bugs and feature requests.

## Before you start
- Install Clawdbot/Moltbot and confirm the gateway runs locally.
- This repo is UI-only and reads config from `~/.clawdbot` or `~/.moltbot`.
- It does not run or build the gateway from source.

## Local setup
```bash
git clone https://github.com/<your-org>/clawdbot-agent-ui.git
cd clawdbot-agent-ui
npm install
cp .env.example .env
npm run dev
```

## Testing
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run e2e` (requires `npx playwright install`)

## Pull requests
- Keep PRs focused and small.
- Include the tests you ran.
- Link to the relevant issue.
- If you changed gateway behavior, call it out explicitly.

## Reporting issues
When filing an issue, please include:
- Reproduction steps
- OS and Node version
- Any relevant logs or screenshots

## Minimal PR template
```md
## Summary
- 

## Testing
- [ ] Not run (explain why)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run e2e`

## AI-assisted
- [ ] AI-assisted (briefly describe what and include prompts/logs if helpful)
```

## Minimal issue template
```md
## Summary

## Steps to reproduce
1.

## Expected

## Actual

## Environment
- OS:
- Node:
- UI version/commit:
- Gateway running? (yes/no)

## Logs/screenshots
```
