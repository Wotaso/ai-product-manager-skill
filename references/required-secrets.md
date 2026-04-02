# Required Secrets

Use this checklist before running autopilot mode.

## Baseline

| Env var | Purpose | Required | Minimum scope |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Repo analysis target + GitHub issue/PR creation | Yes | Issue mode: `Issues: Read/Write`, `Contents: Read`. PR mode: `Pull requests: Read/Write`, `Contents: Read/Write` |
| `ANALYTICSCLI_READONLY_TOKEN` | AnalyticsCLI command auth when no local login exists | Recommended | Read-only analytics access |
| `REVENUECAT_API_KEY` | RevenueCat command/API refresh | Recommended | Read-only where possible |
| `SENTRY_AUTH_TOKEN` | Sentry command/API refresh | Recommended | Read-only issue/event scopes |

## Extra Connectors

For `sources.extra[]`, set `secretEnv` only when the connector actually needs it.

Examples:

- `GLITCHTIP_API_TOKEN`
- `ASC_API_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_PRIVATE_KEY`
- `PLAY_CONSOLE_SERVICE_ACCOUNT_JSON`

## Red Lines

- Never commit secrets to git
- Never store secrets in `data/openclaw-growth-engineer/config.json`
- Never put secrets into proposal files, issues, or PR bodies
- Do not ship privileged feedback keys directly in mobile app binaries unless they are intentionally public and app-scoped
