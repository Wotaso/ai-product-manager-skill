# OpenClaw Growth Engineer

OpenClaw-first growth autopilot for mobile apps.
It correlates analytics, monetization, crashes, feedback, store/release signals, and repo context into implementation-ready GitHub output.

## Install

OpenClaw / ClawHub:

```bash
npx -y clawhub install openclaw-growth-engineer
```

After install, copy the runtime into the workspace root once:

```bash
bash skills/openclaw-growth-engineer/scripts/bootstrap-openclaw-workspace.sh
```

That creates:

- `scripts/openclaw-growth-*.mjs`
- `scripts/openclaw-feedback-api.mjs`
- `data/openclaw-growth-engineer/*.example.json`

## Setup

Generate non-secret config:

```bash
node scripts/openclaw-growth-wizard.mjs
```

This writes:

- `data/openclaw-growth-engineer/config.json`

The wizard lets you choose:

- GitHub delivery mode: `issue` or `pull_request`
- built-in connectors
- extra connectors under `sources.extra[]`
- charting

## Core Commands

Preflight:

```bash
node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections
```

Unified setup + first run:

```bash
node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json
```

One run:

```bash
node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json
```

Loop mode:

```bash
node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json --loop
```

## GitHub Output Modes

Issue mode:

- creates implementation-ready GitHub issues
- best for backlog-first planning

Pull-request mode:

- creates draft PRs
- adds `.openclaw/proposals/<date>/<slug>.md` files into the repo
- good when you want the requested change documented directly inside the codebase

## Connector Strategy

Built-in:

- `analytics`
- `revenuecat`
- `sentry`
- `feedback`

Extra mobile connectors via `sources.extra[]`:

- `glitchtip`
- `asc-cli`
- `firebase-crashlytics`
- `app-store-reviews`
- `play-console`
- `stripe`
- `adapty`
- `superwall`

Any extra connector works when it outputs:

- `signals[]`
- or `issues[]` for crash tools
- or `items[]` for feedback/review tools

## Feedback Best Practice

- For tenant mobile apps, use the SDK `submitFeedback(...)` helper only against a tenant-owned backend/proxy or an explicitly app-scoped external feedback endpoint
- Always send a stable `locationId`
- Do not emit raw feedback text into analytics events
- Let OpenClaw consume the aggregated feedback summary plus the lightweight `feedback:submitted` analytics events

## Current RevenueCat Status

What already exists without this skill:

- RevenueCat webhook live sync into analytics events via the API route
- analytics/event-side correlation when the same stable user id is used

What is still not a guided dashboard/CLI connector today:

- no dedicated dashboard "connect RevenueCat" flow
- no dedicated `analyticscli revenuecat connect` command

This skill fills the operational gap by letting OpenClaw consume RevenueCat summaries directly via `mode=file` or `mode=command`.

## References

- [SKILL.md](SKILL.md)
- [Setup And Scheduling](references/setup-and-scheduling.md)
- [Required Secrets](references/required-secrets.md)
- [Input Schema](references/input-schema.md)
