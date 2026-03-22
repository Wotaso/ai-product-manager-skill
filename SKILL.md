---
name: product-manager-skill
description: Turn analytics and customer signals into prioritized product decisions, PRD drafts, experiment plans, and implementation-ready GitHub backlog issues.
license: MIT
homepage: https://github.com/wotaso/analyticscli-skills
metadata: {"author":"wotaso","version":"0.3.0","openclaw":{"emoji":"📌","homepage":"https://github.com/wotaso/analyticscli-skills"}}
---

# Product Manager Skill

## Use This Skill When

- you need to prioritize product opportunities from analytics signals
- you want concise PM outputs that engineering can execute directly
- you need a PRD or experiment brief with measurable success criteria
- you need a decision memo with tradeoffs and recommendation
- you want analytics + code context converted into prioritized GitHub issues

## Core Rules

- Always state assumptions explicitly before recommendations.
- Prioritize with an `impact x confidence x effort` rationale.
- Tie every recommendation to at least one measurable KPI.
- Keep scope bounded: max 3 major opportunities or max 3-5 generated issues per pass.
- Avoid generic advice without concrete scope and acceptance criteria.
- Mark low-confidence conclusions clearly if data quality is weak.
- For implementation outputs, include explicit file/module hypotheses.
- For autopilot mode, run a preflight checklist and list missing dependencies/secrets explicitly.

## Required Inputs

- problem statement or objective
- at least one data source summary (analytics, feedback, revenue, errors)

## Optional Inputs

- constraints (timeline, team capacity, dependencies)
- strategic context (OKRs, business goals, target segment)
- existing roadmap or in-flight initiatives
- repository root (for file/module mapping when generating issue drafts)
- GitHub repo + token (only when issue auto-creation is requested)

## Autopilot Preconditions (Mandatory)

Before running issue generation/autopilot mode, verify and report:

- Data sources:
  - `analytics_summary.json` (required)
  - `revenuecat_summary.json` (recommended for monetization decisions)
  - `sentry_summary.json` (recommended for stability prioritization)
  - `feedback_summary.json` (optional, but high value)
- Code-readiness:
  - `--repo-root` points to the target repository checkout
  - agent user has read access to the codebase
  - if needed, restrict scan with `--code-roots apps,packages`
- Runtime dependencies:
  - `node` for analyzer/runner
  - `analyticscli` CLI for analytics data extraction
  - optional charting: `python3` + `matplotlib`
- Secrets:
  - `GITHUB_TOKEN` (required when `--create-issues`)
  - `ANALYTICSCLI_READONLY_TOKEN`
  - `REVENUECAT_API_KEY`
  - `SENTRY_AUTH_TOKEN`
  - optional `FEEDBACK_API_TOKEN`

If anything is missing, stop autopilot and return a concrete "missing items" list with where to obtain each value.

## Standard Output Format

Return results in this order:

1. `Executive Summary` (3-5 lines)
2. `Top Opportunities` (max 3, ranked)
3. `Recommendation` (single preferred path + why)
4. `Execution Scope` (in-scope, out-of-scope, dependencies)
5. `KPIs And Targets` (baseline, target, measurement window)
6. `Acceptance Criteria` (implementation-ready)
7. `Risks And Mitigations`
8. `Next 7-Day Plan`

If the user explicitly asks for issue generation/autopilot mode, return this format instead:

1. `Executive Summary` (3-5 lines)
2. `Top Issue Drafts` (3-5, ranked)
3. `Recommendation` (single preferred execution path)
4. `Execution Order` (week 1 sequencing)
5. `Risks And Guardrails`

Each issue draft must include:

- `Problem`
- `Evidence`
- `Affected Files / Modules`
- `Proposed Implementation`
- `Expected Impact`
- `Confidence`
- optional PR prompt

## Output Quality Bar

- recommendations are testable within one iteration cycle
- each KPI has a concrete time window
- acceptance criteria can be copied into engineering tickets
- risk section includes at least one rollback or guardrail condition
- in issue mode, each issue has clear file/module hypotheses and measurable impact

## Anti-Patterns

- broad strategy talk without operational next steps
- recommendations that ignore technical or business constraints
- “improve UX” phrasing without affected flow/module hypothesis

## Local Autopilot Commands And Checks

Preflight:

```bash
node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json
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

Optional chart generation (`matplotlib`) + manifest:

```bash
python3 scripts/openclaw-growth-charts.py \
  --analytics data/openclaw-growth-engineer/analytics_summary.example.json \
  --out-dir data/openclaw-growth-engineer/charts \
  --manifest data/openclaw-growth-engineer/charts.manifest.json
```

Optional auto-create GitHub issues:

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

## References

- [README](README.md)
- [Required Secrets](references/required-secrets.md)
- [Setup And Scheduling](references/setup-and-scheduling.md)
- [Input Schema](references/input-schema.md)
- [Issue Template](references/issue-template.md)
