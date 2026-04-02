---
name: openclaw-growth-engineer
description: OpenClaw-first growth autopilot for mobile apps. Correlate analytics, crashes, billing, feedback, store signals, and repo context into implementation-ready GitHub issues or draft pull requests.
license: MIT
homepage: https://github.com/wotaso/analyticscli-skills
metadata: {"author":"wotaso","version":"1.0.0","openclaw":{"emoji":"🚀","homepage":"https://github.com/wotaso/analyticscli-skills"}}
---

# OpenClaw Growth Engineer

## Use This Skill When

- you want OpenClaw to turn product signals into execution-ready backlog work
- you need one mobile-first workflow across analytics, RevenueCat, Sentry/GlitchTip, ASC CLI, app reviews, support feedback, and repo context
- you want GitHub repo access to be mandatory and used as part of prioritization
- you want OpenClaw to create either GitHub issues or draft pull requests with proposal files

## Product Focus

- Primary focus: mobile apps
- Works well with: React Native, Expo, native iOS/Android, mobile growth loops, paywalls, store reviews, crashes, release readiness
- Still valid for SaaS/web products when your connectors export the same summary JSON shape

## Mandatory Baseline

Before autopilot runs, these are non-negotiable:

- `analyticscli` CLI available
- `analyticscli-cli` skill installed/fetched
- target repo checkout readable via `project.repoRoot`
- GitHub repo known (`project.githubRepo`)
- `GITHUB_TOKEN` present

GitHub is mandatory for this skill. It is not just an optional export sink.
The repo is part of the analysis surface for file/module mapping and the delivery target for issues or draft PRs.

## GitHub Modes

The skill supports both delivery modes:

- `actions.mode = "issue"`: create implementation-ready GitHub issues
- `actions.mode = "pull_request"`: create draft PRs that add `.openclaw/proposals/...md` proposal files to the repo

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
- Use human-meaningful, code-stable location ids such as `onboarding/paywall`, `settings/restore`, `profile/delete_account`
- The SDK should track lightweight feedback submission events without sending raw feedback text into analytics events

## Startup Protocol

When the user says "start", "run", or "kick off" the skill:

1. If `scripts/openclaw-growth-start.mjs` is missing at workspace root but the skill is installed under `skills/openclaw-growth-engineer/`, run:
   - `bash skills/openclaw-growth-engineer/scripts/bootstrap-openclaw-workspace.sh`
2. Run portable checks first:
   - `command -v analyticscli`
   - `analyticscli projects list`
   - detect `project.githubRepo` from git remote when possible
   - verify `GITHUB_TOKEN`
3. Run preflight:
   - `node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections`
4. If preflight fails, return only a concrete blocker checklist
5. If preflight passes, run:
   - `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json`

Do not block startup merely because local helper files are missing. Bootstrap the workspace first when the skill was installed under `skills/openclaw-growth-engineer/`.

## Output Rules

- max 3-5 proposals per pass
- each proposal must include measurable impact and file/module hypotheses
- each proposal must say what should change
- low-confidence findings must be marked explicitly
- recommendations without GitHub repo context are incomplete

## Required Secrets

- `GITHUB_TOKEN`
  - required
  - issue mode: `Issues: Read/Write`, `Contents: Read`
  - pull-request mode: `Pull requests: Read/Write`, `Contents: Read/Write`
- `ANALYTICSCLI_READONLY_TOKEN`
  - recommended
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
