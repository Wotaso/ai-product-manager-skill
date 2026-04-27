---
name: openclaw-growth-engineer
description: OpenClaw-first growth autopilot for mobile apps. Correlate analytics, crashes, billing, feedback, store signals, and repo context into proposal drafts that can flow into OpenClaw chat, GitHub issues, or draft pull requests.
license: MIT
homepage: https://github.com/wotaso/analyticscli-skills
metadata: {"author":"wotaso","version":"1.0.8","analyticscli-target":"@analyticscli/cli","analyticscli-supported-range":">=0.1.2-preview.0 <0.2.0","openclaw":{"emoji":"🚀","homepage":"https://github.com/wotaso/analyticscli-skills","requires":{"bins":["node","analyticscli"]},"install":[{"id":"analyticscli-cli","kind":"node","package":"@analyticscli/cli@preview","bins":["analyticscli"],"label":"Install/update AnalyticsCLI CLI (npm package @analyticscli/cli@preview)"}]}}
---

# OpenClaw Growth Engineer

## Use This Skill When

- you want OpenClaw to turn product signals into execution-ready backlog work
- you need one mobile-first workflow across analytics, RevenueCat, Sentry/GlitchTip, ASC CLI, app reviews, support feedback, and repo context
- you want the deterministic work to live in a standalone CLI and OpenClaw to stay the AI/chat layer
- you want proposal delivery to be configurable between OpenClaw chat handoff, GitHub issues, and draft pull requests

## Product Focus

- Primary focus: mobile apps
- Works well with: React Native, Expo, native iOS/Android, mobile growth loops, paywalls, store reviews, crashes, release readiness
- Still valid for SaaS/web products when your connectors export the same summary JSON shape

## Preferred Runtime

Prefer the standalone `openclaw` CLI as the runtime surface.

- Setup path: `openclaw setup --config openclaw.config.json`
- Primary path: `openclaw start --config openclaw.config.json`
- Local monorepo path: `pnpm --filter @analyticscli/openclaw-cli dev -- start`
- Legacy copied-runtime scripts under `scripts/openclaw-growth-*.mjs` remain fallback-only for older OpenClaw workspaces

The CLI is intentionally non-AI. OpenClaw should stay the only conversational/implementation layer.
Use the CLI to gather signals, generate proposals, schedule checks, and send deliveries.
If the user later asks OpenClaw to implement a proposal, OpenClaw should inspect the generated drafts and then use its own AI/runtime to do the work.
`openclaw setup` should reuse the existing `analyticscli setup` flow instead of redefining skill installation locally. That means shared skills such as `analyticscli-cli` and `analyticscli-ts-sdk` come from the canonical AnalyticsCLI installer.

## Mandatory Baseline

Before autopilot runs, these are non-negotiable:

- `analyticscli` CLI available
- target repo checkout readable via `project.repoRoot`
- a writable `openclaw.config.json`
- `sources.analytics` enabled

GitHub is optional unless GitHub delivery is enabled.
The repo is still part of the analysis surface for file/module mapping, but `project.githubRepo` and `GITHUB_TOKEN` become hard requirements only when the CLI should auto-create GitHub issues or pull requests.

## Dependency Refresh Protocol

Run this protocol at the start of every setup/start/run request, and whenever the user asks to fetch, update, upgrade, or reinstall this skill.
Do not stop after saying the skill was fetched from ClawHub.
The job is not done until the npm binary and companion skills are updated and verified.

1. Refresh this ClawHub skill:
   ```bash
   npx -y clawhub install ai-product-manager
   ```
2. Refresh the AnalyticsCLI agent skill:
   ```bash
   npx -y skills add wotaso/analyticscli-skills --skill analyticscli-cli
   ```
   If the `skills` command is unavailable or this is an OpenClaw-only environment, continue with the npm package install instead of blocking.
3. Install or update the npm package that provides the `analyticscli` binary:
   ```bash
   npm install -g @analyticscli/cli@preview
   ```
4. If global npm install fails with a permissions error, use the bundled helper from the installed skill root:
   ```bash
   bash skills/openclaw-growth-engineer/scripts/install-analyticscli-cli.sh
   ```
5. Verify and report the exact binary path:
   ```bash
   command -v analyticscli
   analyticscli --help
   ```

If `analyticscli: command not found` still happens, do not claim setup is complete.
Find the user-local binary and fix PATH for current and future shells:

```bash
export PATH="$HOME/.local/bin:$PATH"
command -v analyticscli || ls -l "$HOME/.local/bin/analyticscli"
```

If the binary exists under `$HOME/.local/bin`, tell the user the current already-open terminal needs:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## AnalyticsCLI CLI Install Protocol

Before any setup, preflight, start, or run path tries to execute `analyticscli`, make sure the npm package is installed and current.
If the user reports `analyticscli: command not found`, run the Dependency Refresh Protocol before any other action.

The package name is `@analyticscli/cli`; the installed binary name is `analyticscli`.
Do not search npm for `analyticscli` or `analyticsscli`.

Use this exact install/update command:

```bash
npm install -g @analyticscli/cli@preview
```

Then verify:

```bash
command -v analyticscli
analyticscli --help
```

If global npm installs are blocked on a VPS, use the bundled helper from the installed skill root:

```bash
bash skills/openclaw-growth-engineer/scripts/install-analyticscli-cli.sh
```

The helper falls back to a user-local npm prefix at `~/.local` when global install fails with permissions errors, prepends `~/.local/bin` for the current run, and prints a PATH hint if the shell needs it.
Only ask the user for help if both direct npm install and the bundled helper fail with a concrete permission, missing `npm`, or network error.

## Delivery Modes

The CLI can write proposals to one or more targets:

- `deliveries.openclawChat.enabled = true`: write `.openclaw/chat/latest.md` and `.openclaw/chat/latest.json` for OpenClaw to pick up in chat
- `deliveries.github.mode = "issue"` with `deliveries.github.autoCreate = true`: create implementation-ready GitHub issues
- `deliveries.github.mode = "pull_request"` with `deliveries.github.autoCreate = true`: create draft PRs that add `.openclaw/proposals/...md` proposal files to the repo

Use issue mode when:

- you want backlog-first planning
- engineering should pick up and implement later

Use pull-request mode when:

- you want every proposal anchored in a branch and reviewable artifact
- you want the requested changes written down inside the repository immediately

## Connector Model

Built-in channels:

- `analytics`
- `revenuecat`
- `sentry`
- `feedback`
  default command path: `analyticscli feedback summary --format json`
  default cursor behavior: auto-bounded with `--last 30d` on first run, then `--since <lastCollectedAt>` on later runs unless the command already sets `--since`, `--until`, or `--last`

Additional connectors:

- configure `sources.extra[]`
- each extra connector can use `mode=file` or `mode=command`
- preferred output is shared `signals[]`
- crash-style tools may use `issues[]`
- feedback-style tools may use `items[]`

Mobile-focused examples:

- `glitchtip`
- `firebase-crashlytics`
- `asc-cli`
- `app-store-reviews`
- `play-console`
- `stripe`
- `adapty`
- `superwall`

## Feedback Rules

- Prefer tenant-owned backend/proxy submission for mobile apps
- Do not put privileged feedback secrets directly into shipped app binaries unless they are intentionally public and app-scoped
- Always include a stable `locationId` for feedback collection points
- Always include a human-readable `originName` for where the feedback originated in the product
- Use human-meaningful, code-stable location ids such as `onboarding/paywall`, `settings/restore`, `profile/delete_account`
- The SDK should track lightweight feedback submission events without sending raw feedback text into analytics events

## Feedback Source Memory

- The CLI should persist per-source cursor state, especially for the built-in `feedback` source.
- Default behavior must avoid accidental historical re-fetches.
- If `sources.feedback.cursorMode = "auto_since_last_fetch"` and the command has no explicit time flags, the CLI should:
  first run: append `--last <initialLookback>` (default `30d`)
  later runs: append `--since <lastCollectedAt>`
- If the user intentionally wants older history again, that must be a conscious action:
  either set explicit `--last` / `--since` / `--until` in the command
  or reset the stored cursor state

## Startup Protocol

When the user says "start", "run", or "kick off" the skill:

1. Run the Dependency Refresh Protocol first. It must update this skill, the `analyticscli-cli` skill when available, and the `@analyticscli/cli@preview` npm package, then verify `command -v analyticscli`.
2. Prefer the CLI entrypoint:
   - `openclaw setup --config openclaw.config.json`
   - this should initialize config and install the shared AnalyticsCLI skills via the canonical AnalyticsCLI setup flow
3. Then run:
   - `openclaw start --config openclaw.config.json`
4. In this monorepo, use the workspace dev entrypoint when `openclaw` is not installed globally:
   - `pnpm --filter @analyticscli/openclaw-cli dev -- start`
5. Run portable checks first when setup is incomplete:
   - `command -v analyticscli`
   - `analyticscli projects list`
   - detect `project.githubRepo` from git remote when possible
   - verify `GITHUB_TOKEN` only if GitHub delivery is enabled
   - if the user already pasted an AnalyticsCLI token candidate, use it immediately for the check/start attempt instead of asking a follow-up token question first
6. If preflight fails, return only a concrete blocker checklist
7. If preflight passes, continue with `openclaw run --config openclaw.config.json`

When the user asks for analysis only:
- run the CLI
- summarize the generated drafts/signals in natural language

When the user asks OpenClaw to implement:
- run the CLI if fresh signals/proposals are needed
- inspect the generated issue drafts
- then implement with OpenClaw itself, not by delegating implementation to the CLI

## Proposal Strategy

The CLI config should expose `strategy.proposalMode`:

- `mandatory`: only strongest, clearly evidenced fixes and must-have requests
- `balanced`: default mix of necessary fixes and moderate product ideas
- `creative`: still evidence-led, but more willing to suggest bolder experiments or feature ideas

Use the legacy bootstrap-and-copy runtime only when the standalone CLI is unavailable in the target workspace.

## Output Rules

- max 3-5 proposals per pass
- each proposal must include measurable impact and file/module hypotheses
- each proposal must say what should change
- low-confidence findings must be marked explicitly
- when GitHub delivery is disabled, proposals should still be fully usable via the OpenClaw chat outbox

## Required Secrets

- `GITHUB_TOKEN`
  - required only when GitHub issue or pull-request delivery is enabled
  - issue mode: `Issues: Read/Write`, `Contents: Read`
  - pull-request mode: `Pull requests: Read/Write`, `Contents: Read/Write`
- `ANALYTICSCLI_ACCESS_TOKEN`
  - recommended for CLI/agent auth when no local CLI login exists
- `REVENUECAT_API_KEY`
  - recommended for RevenueCat command/API mode
- `SENTRY_AUTH_TOKEN`
  - recommended for Sentry command/API mode
- optional connector-specific `secretEnv` per `sources.extra[]`

## References

- [README](README.md)
- [Setup And Scheduling](references/setup-and-scheduling.md)
- [Required Secrets](references/required-secrets.md)
- [Input Schema](references/input-schema.md)
- [Issue Template](references/issue-template.md)
