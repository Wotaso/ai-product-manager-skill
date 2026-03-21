# Product Manager Skill

A focused agent skill to help product teams turn analytics and user signals into clear product decisions, prioritized execution plans, and actionable engineering tasks.

## What This Skill Does

Use this skill when you want an AI assistant that behaves like a hands-on product manager.

It can help you:

- turn raw metrics into prioritized opportunities
- write concise PRDs with clear scope and tradeoffs
- define measurable goals, KPIs, and success criteria
- generate experiment plans (hypothesis, variants, guardrails, rollout)
- create release plans and cross-functional handoff docs
- convert product ideas into implementation-ready backlog items
- draft stakeholder updates in plain business language

## Best Use Cases

- weekly product review from analytics dashboards
- feature discovery and scope definition
- conversion funnel optimization planning
- roadmap prioritization under limited engineering capacity
- post-launch readouts and next-step recommendations

## Installation

Install the whole skill pack:

```bash
npx skills add wotaso/analyticscli-skills
```

Install only this skill:

```bash
npx skills add wotaso/analyticscli-skills --skill product-manager-skill
```

## Quick Start

After installation, call the skill with a concrete PM task and context.

Example prompt:

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

## What This Skill Is Not

- It does not replace product strategy ownership.
- It does not guarantee causality from observational analytics alone.
- It should not be used without validation for high-risk decisions.

## Team Workflow Suggestion

1. Run the skill after weekly metrics refresh.
2. Validate top recommendations with engineering + design.
3. Convert approved outputs into tickets.
4. Review KPI movement after release and rerun the skill.

## Versioning

Keep instruction-pack changes in `SKILL.md` metadata versioning once the skill is added to the public pack.

## License

MIT (inherits the skill-pack repository license).
