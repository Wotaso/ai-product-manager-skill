# Required Secrets

Use this checklist before running autopilot mode.

## Secret Inventory

| Env var | Purpose | Required | Where to get it |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Create GitHub issues via API (`--create-issues`) | Yes, for issue auto-creation | GitHub -> Settings -> Developer settings -> Fine-grained PAT |
| `ANALYTICSCLI_READONLY_TOKEN` | Read analytics data with CLI commands | Recommended | [dash.analyticscli.com](https://dash.analyticscli.com) -> Project -> API Keys -> `readonly_token` |
| `REVENUECAT_API_KEY` | Pull RevenueCat monetization data | Recommended | RevenueCat -> Project -> API Keys (Secret key) |
| `SENTRY_AUTH_TOKEN` | Pull Sentry issue/event summaries | Recommended | Sentry -> User Settings -> Auth Tokens |
| `FEEDBACK_API_TOKEN` | Protect optional public feedback endpoint | Optional | Generate locally, e.g. `openssl rand -hex 32` |

## Minimum Scopes

- `GITHUB_TOKEN`:
  - Repository `Issues`: Read and Write
  - Repository `Contents`: Read
- `ANALYTICSCLI_READONLY_TOKEN`:
  - Read-only analytics access for selected project
- `REVENUECAT_API_KEY`:
  - Read-only access where supported
- `SENTRY_AUTH_TOKEN`:
  - Read scopes for issues/events/projects in the target org/project

## Red Lines

- Never commit secrets to git.
- Never store secrets in `data/openclaw-growth-engineer/config.json`.
- Never pass secrets in CLI arguments.
- Never print full secrets in logs.
