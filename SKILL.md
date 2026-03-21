---
name: product-manager-skill
description: Turn analytics and customer signals into prioritized product decisions, PRD drafts, experiment plans, and implementation-ready backlog items.
license: MIT
homepage: https://github.com/wotaso/analyticscli-skills
metadata: {"author":"wotaso","version":"0.1.0","openclaw":{"emoji":"📌","homepage":"https://github.com/wotaso/analyticscli-skills"}}
---

# Product Manager Skill

## Use This Skill When

- you need to prioritize product opportunities from analytics signals
- you want concise PM outputs that engineering can execute directly
- you need a PRD or experiment brief with measurable success criteria
- you need a decision memo with tradeoffs and recommendation

## Core Rules

- Always state assumptions explicitly before recommendations.
- Prioritize with an `impact x confidence x effort` rationale.
- Tie every recommendation to at least one measurable KPI.
- Keep scope bounded: max 3 major opportunities per pass.
- Avoid generic advice without concrete scope and acceptance criteria.
- Mark low-confidence conclusions clearly if data quality is weak.

## Required Inputs

- problem statement or objective
- at least one data source summary (analytics, feedback, revenue, errors)

## Optional Inputs

- constraints (timeline, team capacity, dependencies)
- strategic context (OKRs, business goals, target segment)
- existing roadmap or in-flight initiatives

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

## Output Quality Bar

- recommendations are testable within one iteration cycle
- each KPI has a concrete time window
- acceptance criteria can be copied into engineering tickets
- risk section includes at least one rollback or guardrail condition

## Anti-Patterns

- broad strategy talk without operational next steps
- recommendations that ignore technical or business constraints
- “improve UX” phrasing without affected flow/module hypothesis

## References

- [README](README.md)
