# Setup And Scheduling

This is the recommended OpenClaw-first baseline.

## 1) Install Runtime

```bash
npx -y clawhub install openclaw-growth-engineer
bash skills/openclaw-growth-engineer/scripts/bootstrap-openclaw-workspace.sh
```

The runtime must also ensure the AnalyticsCLI npm package is present. The package name is
`@analyticscli/cli`; the binary name is `analyticscli`.

```bash
npm install -g @analyticscli/cli@preview
```

If global npm installs fail on a VPS, use:

```bash
bash skills/openclaw-growth-engineer/scripts/install-analyticscli-cli.sh
```

`openclaw setup`, `openclaw start`, and the copied preflight/start runtime should run this
install/update automatically before using `analyticscli`.

## 2) Generate Config

```bash
node scripts/openclaw-growth-wizard.mjs
```

The config is non-secret and commit-safe:

- `data/openclaw-growth-engineer/config.json`

The setup flow should be developer-friendly:

- auto-detect repo root, package manager, git remote, and available AnalyticsCLI auth when possible
- explain why each requested connection is needed before asking for it
- ask for the minimum missing secret or permission, not a broad token
- show a status checklist after setup: configured, optional, blocked, and next command
- hand off weak or missing app instrumentation to the `analyticscli-ts-sdk` skill with concrete SDK setup steps
- ask exactly which optional connections the user wants to set up before requesting credentials: AnalyticsCLI baseline with feedback summaries, GitHub code access, ASC / App Store Connect CLI, RevenueCat, Sentry-compatible crash monitoring including Sentry Cloud and GlitchTip accounts, or skip
- ask how the tool should be used before enabling scheduling: production autopilot, advisory-only summaries, or manual reports
- ask whether to keep the default cadence plan; if not, collect what should happen daily, weekly, monthly, every 3 months, every 6 months, and yearly

For GitHub, RevenueCat, Sentry, and App Store Connect connector setup, use the connector wizard instead of asking the user to compose setup commands manually:

```bash
node scripts/openclaw-growth-wizard.mjs --connectors github,revenuecat,sentry,asc
```

The connector wizard asks only for the selected connectors, explains each provider step in the terminal, writes local secrets to `~/.config/openclaw-growth/secrets.env`, and runs helper setup for the selected connectors.

## 3) Choose GitHub Code Access And Delivery Mode

Connect GitHub with readable repo/code access whenever possible.
This is very important for turning analytics signals into concrete file/module hypotheses.
Issue and pull-request write permissions are optional; request them only when the selected delivery mode should create GitHub artifacts.

Prefer GitHub CLI:

```bash
gh auth status
gh auth login
gh repo view --json nameWithOwner,defaultBranchRef
```

For analysis-only token fallback, ask for a fine-grained read-only token with `Contents: Read` and `Metadata: Read`.
Ask for all repositories only when the user wants cross-repo code analysis.

Set in config:

- `actions.mode = "issue"`
- or `actions.mode = "pull_request"`

PR mode creates proposal branches and draft PRs with `.openclaw/proposals/...md` files.

## 4) Configure Connectors

Built-in source keys:

- `analytics`
- `revenuecat`
- `sentry`
- `feedback`

Treat `feedback` as an AnalyticsCLI/custom feedback source key, not as a separate primary connector in high-level setup answers.

Extra sources:

- add entries to `sources.extra[]`
- use `mode=file` for the most stable setup
- use `mode=command` only when the command deterministically returns JSON

Recommended mobile extras:

- `app-store-reviews`
- `play-console`

Do not configure GlitchTip as a separate extra connector when it exposes the Sentry-compatible API. Put Sentry Cloud and GlitchTip instances under `sources.sentry.accounts[]` so crash monitoring remains one Sentry-compatible connector. ASC is a first-class App Store Connect connector, not an extra analytics alias.

For Apple-platform apps, ask whether to connect the `asc` CLI plus the App Store Connect agent skill for read-only App Store Connect reporting.
When configured, use every available read-only ASC surface: App Analytics, Sales and Trends, downloads/units, redownloads, conversion, source traffic, app usage, purchases, subscriptions, ratings/reviews, build/TestFlight/release context, and crash totals. Do not describe ASC as partial or analytics-only once it is connected.
Recommended least privilege: Sales for analytics/sales reports, Customer Support for review text, Developer for builds/TestFlight context, and App Manager only when app metadata or release settings are explicitly needed. Avoid Admin unless a one-off App Store Connect permission requires it.

ASC key locations:

- Team key: App Store Connect -> Users and Access -> Integrations -> App Store Connect API
- Individual key: profile menu -> Edit Profile -> Individual API Key

RevenueCat setup:

- Ask whether to connect RevenueCat for monetization/subscription data.
- For SDK instrumentation use only the public app-specific SDK key in app code.
- For server-side summaries use a secret API key from RevenueCat -> Project Settings -> API Keys -> + New secret API key.
- Prefer v2 read permissions for charts/metrics and required project configuration resources; store as `REVENUECAT_API_KEY`.

Sentry setup:

- Ask whether to connect Sentry-compatible crash monitoring for crash, error, release, and performance signals.
- Use the wizard to collect one or more accounts directly. For each account, collect label, `baseUrl`, `tokenEnv`, token, `org`, `environment`, and optional comma-separated `projects[]`.
- Do not ask for one global `SENTRY_PROJECT` in the setup wizard. Defer Sentry project selection to app/repo/release context, or set account-specific `sources.sentry.accounts[].projects[]` only when a product has a known fixed mapping.
- For multiple Sentry-compatible accounts, configure `sources.sentry.accounts[]` with separate `baseUrl`, `tokenEnv`, `org`, `projects[]`, and `environment` values for each account, for example Sentry Cloud plus self-hosted GlitchTip with different projects.
- Use read-only Sentry API scopes: `org:read`, `project:read`, and `event:read`.
- The direct source command is `node scripts/export-sentry-summary.mjs`; optional MCP config uses `@sentry/mcp-server@latest` when `npx` is available.
- Treat Sentry as connected only after auth and exporter smoke tests pass.
- Multiple Sentry-compatible accounts are supported. Put them under `sources.sentry.accounts[]` with a separate `baseUrl`, `tokenEnv`, `org`, `projects[]`, and `environment` for each account. Use this for setups such as Sentry Cloud plus self-hosted GlitchTip where the projects and tokens differ.
- For production crash monitoring, compare Sentry issue/event/user counts with ASC total crashes and app-version crash breakdowns. ASC `crashRate` is supporting context; total crashes and affected users are the daily alert trigger.

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

- `analyticscli` package install/update and binary availability
- `analyticscli-cli` skill presence
- readable GitHub repo access when available for code-aware analysis
- connector file/command readiness
- required secrets for enabled sources and delivery modes
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

OpenClaw heartbeat:

The setup/bootstrap path must also leave a real workspace `HEARTBEAT.md` task in place. OpenClaw skips heartbeat runs when `HEARTBEAT.md` is empty or comment-only, so an enabled Growth Engineer schedule is not sufficient by itself.

Expected heartbeat task:

```yaml
tasks:

- name: openclaw-growth-engineer-run
  interval: 1d
  prompt: "Run `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json` from the workspace if the config and runtime files exist. The runner owns schedule.cadences, connectorHealthCheckIntervalMinutes, skipIfNoDataChange, and skipIfIssueSetUnchanged. If it reports connector-health alerts, production crashes, generated issues, or actionable growth findings, summarize only the action and evidence. If setup files are missing, tell the user to run `node scripts/openclaw-growth-wizard.mjs --connectors`. If there is no actionable output, reply HEARTBEAT_OK."
```

When `schedule.intervalMinutes` is customized, `openclaw-growth-start.mjs` should rewrite this task interval to the same cadence. The heartbeat wakes OpenClaw; the runner decides whether daily, weekly, monthly, quarterly, six-month, or yearly work is due.

## 7a) Production Health And Growth Cadence

The default loop interval is one day (`schedule.intervalMinutes = 1440`). Daily runs should cover public production apps only.
If ASC web analytics returns a 403 for an app that is not public yet, record it as skipped/not-public rather than a failure.

Daily:

- Only investigate critical production or business-health issues: Sentry/GlitchTip production errors, crashes, very low users, conversion, purchases, or other urgent drops.
- Check ASC total production crashes by app version and Sentry production issues/events/users.
- Notify the OpenClaw user through configured chat/social delivery when total production crashes are non-zero.
- Check every available ASC overview metric, especially units/downloads, redownloads, conversion rate, app usage, updates, app opens, subscription state, source traffic, and unique product page views by source, but only alert on severe anomalies during daily-only runs.
- If the ASC web analytics session is missing or expired, tell the user to run `asc web auth login`, verify with `asc web auth status --output json --pretty`, and rerun OpenClaw Growth.
- Compare crash movement with release/build data before recommending more acquisition traffic.
- Inspect memory/state and recent releases/code changes before assigning root cause.
- Automatically create GitHub issues or implementation PRs when OpenClaw has configured GitHub API write access. Skip only when write access is missing, the finding is too low-confidence, or `actions.disableAutoCreateGitHubArtifacts = true`.

Weekly:

- Compare units, conversion, source mix, AnalyticsCLI activation/funnels/retention, Sentry stability, RevenueCat monetization when enabled, reviews, and releases.
- Produce one to three Handlungsempfehlungen with evidence, expected KPI movement, and likely code/store surfaces.

Monthly:

- Compare month-over-month units/downloads, redownloads, conversion, source quality, crash totals, review themes, retention, and churn.
- Decide which acquisition channel, listing element, onboarding step, paywall, or feature should be built, changed, or deleted.

Every 3 months:

- Revisit positioning, pricing/packaging, onboarding architecture, roadmap assumptions, tracking quality, and major funnel bets.
- Look for structural constraints and durable opportunities, not only tactical UI changes.

Every 6 months:

- Audit connector coverage, SDK instrumentation, event taxonomy, data reliability, memory/state quality, and whether growth loops still match the best users.
- Prioritize measurement and system fixes that make future recommendations more trustworthy.

Yearly:

- Reset strategy from all available evidence: market/channel fit, monetization model, retention ceiling, product scope, and major surfaces/features.
- Decide whether to double down, reposition, rebuild, or sunset major directions.

Social summaries:

- By default, a meaningful growth run sends a short summary through configured OpenClaw chat, Slack, Discord command, webhook, or equivalent channels.
- Disable with `notifications.growthRun.enabled=false` or by removing all growth-run notification channels.
- Never include secrets in social summaries.

ASC source reporting caveat:

- `asc web analytics sources` reports unique product page views by source. Do not call this downloads by source unless ASC exposes a true source-level download/unit measure.
- Use source page views together with units and conversion rate to infer traffic quality.

## 8) Feedback Collection

Optional local feedback API:

```bash
FEEDBACK_API_TOKEN=<token> node scripts/openclaw-feedback-api.mjs --port 4310
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
