# Advanced Setup

Use this page only when the default wizard flow is not enough.

Default path:

1. Install with `npx -y clawhub install ai-product-manager`
2. Bootstrap once with `bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh`
3. Run `node scripts/openclaw-growth-wizard.mjs`
4. For connector setup, run `node scripts/openclaw-growth-wizard.mjs --connectors github,revenuecat,asc`
5. Run `node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json`

## Secrets

- Keep secrets out of repo files and out of `config.json`.
- Prefer the OpenClaw runtime or secret store for secret injection.
- Use raw env vars only when your OpenClaw setup does not already manage them for you.
- The exact env names live in `config.secrets` and in [Required Secrets](required-secrets.md).

## Connector Overrides

- Built-in sources are `analytics`, `revenuecat`, `sentry`, and `feedback`.
- Extra mobile connectors go into `sources.extra[]`.
- Prefer `mode=file` for maximum stability.
- Use `mode=command` when the command deterministically returns JSON.

Useful extras:

- `asc-cli`
- `app-store-reviews`
- `play-console`
- `glitchtip`
- `firebase-crashlytics`

## Delivery Modes

- `actions.mode = "issue"` creates implementation-ready GitHub issues.
- `actions.mode = "pull_request"` creates draft PRs plus `.openclaw/proposals/...` files.

## Scheduling

- One-shot run: `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json`
- Continuous loop: `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json --loop`
- Preflight only: `node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections`

## Schema And Examples

- [Setup And Scheduling](setup-and-scheduling.md)
- [Required Secrets](required-secrets.md)
- [Input Schema](input-schema.md)
