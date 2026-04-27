# OpenClaw Growth Engineer

OpenClaw-first growth autopilot for mobile apps, centered around a standalone `openclaw` CLI runtime plus OpenClaw itself as the AI layer.

It pulls together analytics, monetization, crashes, feedback, store signals, and repo context and turns them into proposal drafts that can be handed to OpenClaw chat, GitHub issues, or draft PRs.

If you only want the normal setup path: run setup once, then start the CLI.

## Quick Start

1. Run setup:

```bash
openclaw setup --config openclaw.config.json
```

This should:

- initialize `openclaw.config.json`
- install/update `@analyticscli/cli@preview` so the `analyticscli` binary exists
- reuse the existing AnalyticsCLI setup flow
- install/update the shared skills like `analyticscli-cli` and `analyticscli-ts-sdk`
- install the canonical OpenClaw skill path through the shared installer instead of redefining it locally

2. Run preflight:

```bash
openclaw preflight --config openclaw.config.json --test-connections
```

The preflight/start runtime also repairs a missing `analyticscli` binary by running:

```bash
npm install -g @analyticscli/cli@preview
```

If global npm installs are blocked, it falls back to a user-local npm prefix at `~/.local`.
For manual repair from a copied skill runtime, run:

```bash
bash skills/openclaw-growth-engineer/scripts/install-analyticscli-cli.sh
```

3. Start the first pass:

```bash
openclaw start --config openclaw.config.json
```

## What It Does

- Reads analytics by default and can add RevenueCat, Sentry/GlitchTip, feedback, store/release connectors, Slack, and generic webhooks.
- Uses `analyticscli feedback summary --format json` as the built-in feedback source instead of a separate duplicate feedback definition.
- Correlates product signals with repo context; connect GitHub with readable code access whenever possible because it makes analytics findings much more actionable.
- Generates local issue drafts by default.
- Writes an OpenClaw chat outbox by default, and creates GitHub issues or draft pull requests only when GitHub artifact creation is explicitly enabled in config.
- Leaves all conversational analysis and implementation work to OpenClaw itself.

## What The Wizard Writes

The CLI writes only the commit-safe config:

- `openclaw.config.json`

You do not need to hand-edit `openclaw.config.json` for the basic setup.

One useful knob in the config is:

- `strategy.proposalMode = "mandatory" | "balanced" | "creative"`
- `deliveries.openclawChat.enabled = true | false`
- `deliveries.github.mode = "issue" | "pull_request"`
- `deliveries.github.autoCreate = true | false`
- `sources.feedback.cursorMode = "auto_since_last_fetch" | "manual"`
- `sources.feedback.initialLookback = "30d"`

Use it to control how conservative the generated requests should be.
Use the delivery flags to choose whether proposals should show up in OpenClaw chat, become GitHub issues, or land as draft PRs on a new branch.
The feedback cursor settings make old feedback history opt-in instead of accidental: first run uses `--last 30d`, later runs use the stored `lastCollectedAt` unless the command already sets its own time range.

Secrets should stay out of repo files. The normal path is to let OpenClaw manage the runtime environment or secret store and keep the config non-secret.

## Main Commands

Preflight only:

```bash
openclaw preflight --config openclaw.config.json --test-connections
```

One run:

```bash
openclaw run --config openclaw.config.json
```

Loop mode:

```bash
openclaw run --config openclaw.config.json --loop
```

## Maintainer Notes

In this monorepo, `apps/openclaw-cli` is now the preferred runtime surface. The checked-in `skills/openclaw-growth-engineer/src` and `scripts/openclaw-*` files remain compatibility paths while the standalone CLI settles.

The CLI is deliberately deterministic. It should not carry its own AI configuration.
OpenClaw should call the CLI for data collection and proposal generation, then use OpenClaw AI itself when the user wants interpretation or implementation.

Run this after editing runtime scripts:

```bash
pnpm openclaw-skill:quality
```

In the standalone skill repository, run:

```bash
npm run quality
```

The checked-in `.mjs` files are the zero-install runtime artifact for OpenClaw workspaces. Edit `.mts` files under `src/`, then run the quality command to rebuild and verify the runtime.

## Advanced Topics

Keep the README short and use the references below only when you need more control:

- [Advanced Setup](references/advanced-setup.md)
- [Setup And Scheduling](references/setup-and-scheduling.md)
- [Required Secrets](references/required-secrets.md)
- [Input Schema](references/input-schema.md)

## Workspace Files

The bootstrap step creates the runtime files below:

- `scripts/openclaw-growth-*.mjs`
- `scripts/openclaw-feedback-api.mjs`
- `data/openclaw-growth-engineer/*.example.json`
- `data/openclaw-growth-engineer/config.example.json`
