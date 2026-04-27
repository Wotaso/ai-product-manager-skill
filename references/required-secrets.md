# Required Secrets

Use this checklist before running autopilot mode.

## Baseline

| Env var | Purpose | Required | Minimum scope |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Repo/code access for analysis; optional GitHub issue/PR creation | Strongly recommended for code-aware analysis; required only for GitHub issue/PR creation | Prefer GitHub CLI auth when already available. Token fallback: fine-grained read-only `Contents: Read`, `Metadata: Read`; use all repos only for cross-repo analysis. Issue creation: add `Issues: Read/Write`. PR creation: add `Pull requests: Read/Write` and `Contents: Read/Write` |
| `ANALYTICSCLI_ACCESS_TOKEN` | AnalyticsCLI command auth when no local login exists | Recommended | Read-only analytics access across the account |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_PRIVATE_KEY` | Optional App Store Connect Analytics reports via `asc` CLI | Optional, ask before setup | Analytics data only. Prefer Sales/Sales and Reports style access for generated analytics reports; use Admin only temporarily if a report type must be requested first |
| `REVENUECAT_API_KEY` | Optional RevenueCat monetization/subscription refresh | Optional, ask before setup | Secret API key stored server-side only. Prefer v2 read permissions for charts/metrics and required project configuration; add customer/subscriber read only when needed |
| `SENTRY_AUTH_TOKEN` | Sentry command/API refresh | Recommended | Read-only issue/event scopes |

## Extra Connectors

For `sources.extra[]`, set `secretEnv` only when the connector actually needs it.

Examples:

- `GLITCHTIP_API_TOKEN`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_PRIVATE_KEY`
- `ASC_PRIVATE_KEY_PATH`
- `PLAY_CONSOLE_SERVICE_ACCOUNT_JSON`

## Red Lines

- Never commit secrets to git
- Never store secrets in `data/openclaw-growth-engineer/config.json`
- Never put secrets into proposal files, issues, or PR bodies
- Do not ship privileged feedback keys directly in mobile app binaries unless they are intentionally public and app-scoped
