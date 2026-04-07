# OpenClaw Growth Engineer

OpenClaw-first growth autopilot for mobile apps.

It pulls together analytics, monetization, crashes, feedback, store signals, and repo context and turns them into implementation-ready GitHub issues or draft PR proposals.

If you only want the normal setup path: install it, bootstrap the workspace once, run the wizard, then run `openclaw-growth-start`.

## Quick Start

1. Install in OpenClaw / ClawHub:

```bash
npx -y clawhub install ai-product-manager
```

2. Copy the runtime into your repo once:

```bash
bash skills/openclaw-growth-engineer/scripts/bootstrap-openclaw-workspace.sh
```

3. Create the non-secret config with the wizard:

```bash
node scripts/openclaw-growth-wizard.mjs
```

4. Run the guided setup + first preflight:

```bash
node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json
```

## What It Does

- Reads analytics by default and can add RevenueCat, Sentry, feedback, and store/release connectors.
- Correlates product signals with repo context.
- Creates GitHub issues or draft pull requests, depending on your selected mode.

## What The Wizard Writes

The wizard writes only the commit-safe config:

- `data/openclaw-growth-engineer/config.json`

You do not need to hand-edit `config.json` for the basic setup.

Secrets should stay out of repo files. The normal path is to let OpenClaw manage the runtime environment or secret store and keep the config non-secret.

## Main Commands

Preflight only:

```bash
node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections
```

One run:

```bash
node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json
```

Loop mode:

```bash
node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json --loop
```

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
