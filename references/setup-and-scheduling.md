# Setup And Scheduling

This is the recommended OpenClaw-first baseline.

## 1) Install Runtime

```bash
npx -y clawhub install openclaw-growth-engineer
bash skills/openclaw-growth-engineer/scripts/bootstrap-openclaw-workspace.sh
```

## 2) Generate Config

```bash
node scripts/openclaw-growth-wizard.mjs
```

The config is non-secret and commit-safe:

- `data/openclaw-growth-engineer/config.json`

## 3) Choose GitHub Delivery Mode

Set in config:

- `actions.mode = "issue"`
- or `actions.mode = "pull_request"`

PR mode creates proposal branches and draft PRs with `.openclaw/proposals/...md` files.

## 4) Configure Connectors

Built-in sources:

- `analytics`
- `revenuecat`
- `sentry`
- `feedback`

Extra sources:

- add entries to `sources.extra[]`
- use `mode=file` for the most stable setup
- use `mode=command` only when the command deterministically returns JSON

Recommended mobile extras:

- `glitchtip`
- `asc-cli`
- `app-store-reviews`
- `play-console`

## 5) Store Secrets

Prefer OpenClaw secret storage.
Inject env vars at runtime only.

Never store secrets in:

- repo files
- config JSON
- shell history
- issue/PR content

## 6) Validate

```bash
node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections
```

Checks include:

- `analyticscli`
- `analyticscli-cli` skill presence
- GitHub repo access
- connector file/command readiness
- required secrets
- live smoke tests where possible

## 7) Run

One pass:

```bash
node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json
```

Loop:

```bash
node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json --loop
```

## 8) Feedback Collection

Optional local feedback API:

```bash
node scripts/openclaw-feedback-api.mjs --port 4310
```

Expected payload fields now support:

- `feedback`
- `location` / `locationId`
- `appSurface`
- `metadata`

The generated summary aggregates recurring themes and top feedback locations.

## 9) Mobile Feedback Best Practice

- Use tenant-owned backend/proxy endpoints for app-side feedback submission
- Keep `locationId` stable and code-oriented
- Example ids:
  - `onboarding/paywall`
  - `settings/restore`
  - `profile/delete_account`
