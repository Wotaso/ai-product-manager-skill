# Product Manager Skill

Use this skill to turn product signals into prioritized decisions, execution plans, and implementation-ready tasks.
It also supports a growth-autopilot workflow that can generate and optionally create GitHub issues from analytics + code context.

## Start Here

### 1) Prerequisites

- A coding agent (Codex, Claude Code, or OpenClaw).
- If you want automatic/autopilot execution, prefer OpenClaw.
- `node` + `npx` installed.
- For analytics source preparation: `analyticscli` CLI.
- `analyticscli-cli` skill installed/fetched.
- GitHub repo configured + `GITHUB_TOKEN` available (least privilege).
- For charting: `python3` + `matplotlib`.

### 2) Install

Install from the dedicated repository:

```bash
npx skills add Wotaso/ai-product-manager-skill
```

### 3) Init Prompt (copy/paste)

```text
Use product-manager-skill.
Analyze this week-over-week funnel drop (signup -> activation),
propose top 3 opportunities by expected impact, and output:
1) hypothesis
2) KPI target
3) implementation scope
4) acceptance criteria
5) release risk
```

### 4) OpenClaw "Start Skill" Behavior

When user says "start/run the skill", the agent should not ask generic intake questions first.
It should execute:

1. Run portable startup checks first-class:
   - validate `analyticscli` + auth + `GITHUB_TOKEN` + repo detection
   - run bounded `analyticscli` queries
   - generate prioritized issue drafts and create GitHub issues when allowed
2. Missing local repo scripts must never block startup.
3. If blockers exist: stop and return concrete missing/failing items (no manual summary intake).

Important:
- In `start/run` mode, missing prerequisites should be returned as a blocker checklist (config/API keys/access), not as a request for manual analytics summaries.
- Missing local repo scripts must not be treated as hard stop; portable mode is required.
- Missing workspace files under `scripts/` or `data/` must not be treated as blockers in portable mode.

## Required Tooling And Data Connectors

Install AnalyticsCLI tools:

```bash
npm i -g @analyticscli/cli
npm i @analyticscli/sdk@preview
```

Notes:

- The SDK package is currently published on `@preview`.
- When stable releases are available, use `@analyticscli/sdk` without a dist-tag.
- RevenueCat data is expected via RevenueCat MCP/agent export to `revenuecat_summary.json`.
- Sentry data is expected via Sentry MCP/agent export to `sentry_summary.json`.

## What This Skill Does

Use this skill when you want an AI assistant that behaves like a hands-on product manager.

It can help you:

- turn raw metrics into prioritized opportunities
- write concise PRDs with clear scope and tradeoffs
- define measurable goals, KPIs, and success criteria
- generate experiment plans (hypothesis, variants, guardrails, rollout)
- create release plans and cross-functional handoff docs
- convert product ideas into implementation-ready backlog items
- generate prioritized GitHub issue drafts from analytics + code context
- draft stakeholder updates in plain business language

## Best Use Cases

- weekly product review from analytics dashboards
- feature discovery and scope definition
- conversion funnel optimization planning
- roadmap prioritization under limited engineering capacity
- post-launch readouts and next-step recommendations

## Quick Start

After installation, run the init prompt above with your real analytics and product context.

## Recommended Inputs

For best results, provide at least one of these:

- product analytics summary (events, funnel steps, retention, conversion)
- customer feedback themes (support tickets, interviews, app reviews)
- business constraints (timeline, team size, revenue target)
- technical context (known limitations, dependencies, legacy areas)

## Typical Outputs

You should expect structured PM artifacts such as:

- ranked opportunity list (impact x confidence x effort)
- PRD draft with scope and non-goals
- execution plan with milestones and owners
- experiment brief with stop/go decision criteria
- post-release KPI review template
- ranked issue drafts with file/module hypotheses and implementation steps

## Required Secrets (What We Need + Where To Get It)

| Env var | Required when | Where to get it | Minimum scope |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | baseline requirement for this workflow | GitHub -> Settings -> Developer settings -> Fine-grained PAT | Repository Issues: Read/Write, Contents: Read (no full token needed) |
| `ANALYTICSCLI_READONLY_TOKEN` | analytics source in command mode (or explicit token use) | `dash.analyticscli.com` -> Project -> API Keys -> `readonly_token` | Read-only analytics access |
| `REVENUECAT_API_KEY` | RevenueCat source refresh | RevenueCat dashboard -> Project -> API Keys -> Secret API key | Read-only where possible |
| `SENTRY_AUTH_TOKEN` | Sentry source refresh | Sentry -> User Settings -> Auth Tokens | Read-only issue/event scopes |
| `FEEDBACK_API_TOKEN` | optional public feedback API | generate random secret (`openssl rand -hex 32`) | Token match only |

Detailed secret guidance: [`references/required-secrets.md`](references/required-secrets.md)

## Secure Secret Storage Standard (OpenClaw + VPS)

These rules are mandatory:

- Never store tokens in repo files, JSON config, command arguments, or logs.
- Store secrets in OpenClaw secret storage and inject only at runtime.
- On VPS, keep secrets in a root-owned env file outside the repository.
- Restrict file permissions (`0600`) and owner (`root:root`).

Recommended VPS baseline:

1. Create `/etc/openclaw-growth/env` (outside git checkout), owned by root, mode `600`.
2. Put only `KEY=VALUE` lines there.
3. Reference it from `systemd` via `EnvironmentFile=/etc/openclaw-growth/env`.
4. Run the service under a dedicated non-root user with repo read access.

Full setup examples: [`references/setup-and-scheduling.md`](references/setup-and-scheduling.md)

## Ensure Code Can Be Read (For File/Module Mapping)

Issue quality depends on code scanning.

- Always set `--repo-root` to the target repository root.
- Ensure the runner user can read that directory recursively.
- Optionally restrict scanning with `--code-roots apps,packages` for speed and relevance.
- If code is not readable, the analyzer falls back to low-confidence module hypotheses.

## Bundled Runtime (ClawHub / OpenClaw installs)

The published skill includes the same growth-engineer scripts and `data/openclaw-growth-engineer/*.example.json` templates as the Agentic Analytics monorepo, under `scripts/` and `data/` at the project root after install. That is what OpenClaw uses for `node scripts/openclaw-growth-start.mjs`.

In the upstream monorepo, those files are mirrored from `scripts/` and `data/openclaw-growth-engineer/` via `pnpm pm-skill:sync-runtime` whenever the canonical scripts change.

## Local Monorepo Workflow (Optional, not required for OpenClaw start/run)

This skill includes the local MVP autopilot flow via:

- `scripts/openclaw-growth-engineer.mjs`
- `scripts/openclaw-growth-wizard.mjs`
- `scripts/openclaw-growth-runner.mjs`

Preflight checks (dependencies, files, secrets):

```bash
node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections
```

Unified setup + first run:

```bash
node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json
```

Generate issue drafts:

```bash
node scripts/openclaw-growth-engineer.mjs \
  --analytics data/openclaw-growth-engineer/analytics_summary.example.json \
  --revenuecat data/openclaw-growth-engineer/revenuecat_summary.example.json \
  --sentry data/openclaw-growth-engineer/sentry_summary.example.json \
  --repo-root . \
  --max-issues 4
```

Generate charts from analytics signals (`matplotlib`):

```bash
python3 -m pip install matplotlib
python3 scripts/openclaw-growth-charts.py \
  --analytics data/openclaw-growth-engineer/analytics_summary.example.json \
  --out-dir data/openclaw-growth-engineer/charts \
  --manifest data/openclaw-growth-engineer/charts.manifest.json
```

Generate and auto-create GitHub issues:

```bash
GITHUB_TOKEN=ghp_xxx node scripts/openclaw-growth-engineer.mjs \
  --analytics data/openclaw-growth-engineer/analytics_summary.example.json \
  --revenuecat data/openclaw-growth-engineer/revenuecat_summary.example.json \
  --sentry data/openclaw-growth-engineer/sentry_summary.example.json \
  --repo-root . \
  --chart-manifest data/openclaw-growth-engineer/charts.manifest.json \
  --create-issues \
  --repo owner/repo \
  --labels ai-growth,autogenerated,product
```

## What This Skill Is Not

- It does not replace product strategy ownership.
- It does not guarantee causality from observational analytics alone.
- It should not be used without validation for high-risk decisions.

## Team Workflow Suggestion

1. Run the skill after weekly metrics refresh.
2. Validate top recommendations with engineering + design.
3. Convert approved outputs into tickets.
4. Review KPI movement after release and rerun the skill.

## References

- [`SKILL.md`](SKILL.md)
- [`references/setup-and-scheduling.md`](references/setup-and-scheduling.md)
- [`references/required-secrets.md`](references/required-secrets.md)
- [`references/input-schema.md`](references/input-schema.md)
- [`references/issue-template.md`](references/issue-template.md)

## Versioning

Keep instruction-pack changes in `SKILL.md` metadata versioning in the dedicated public repo.

## License

MIT (inherits the skill-pack repository license).
