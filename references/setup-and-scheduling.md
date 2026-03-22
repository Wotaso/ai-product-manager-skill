# Setup And Scheduling (OpenClaw + VPS)

This is the recommended production-safe baseline for running growth autopilot on a VPS with OpenClaw.

## 1) Install Dependencies

```bash
npm i -g @analyticscli/cli
python3 -m pip install matplotlib
```

If SDK instrumentation is part of the target app, install in that app repository:

```bash
npm i @analyticscli/sdk@preview
```

## 2) Generate Non-Secret Config

Run:

```bash
node scripts/openclaw-growth-wizard.mjs
```

This writes non-secret configuration to:

- `data/openclaw-growth-engineer/config.json`

## 3) Store Secrets Securely

### OpenClaw Secret Storage (Preferred)

- Save all tokens in OpenClaw secret storage.
- Inject them into runtime environment variables.
- Keep config files and prompts secret-free.

Expected environment variable names:

- `GITHUB_TOKEN` (required baseline; fine-grained PAT with `Issues: Read/Write` + `Contents: Read`)
- `ANALYTICSCLI_READONLY_TOKEN`
- `REVENUECAT_API_KEY`
- `SENTRY_AUTH_TOKEN`
- optional `FEEDBACK_API_TOKEN`

### VPS Fallback Baseline (When Running Via systemd)

1. Create a root-owned directory and env file outside your repository:
   - `/etc/openclaw-growth/`
   - `/etc/openclaw-growth/env`
2. Set strict permissions:
   - directory `0700`
   - env file `0600`
3. Run services as a dedicated non-root user.
4. Load secrets only through `EnvironmentFile`.

One-time setup commands:

```bash
sudo install -d -m 700 -o root -g root /etc/openclaw-growth
sudo install -m 600 -o root -g root /dev/null /etc/openclaw-growth/env
sudoedit /etc/openclaw-growth/env
```

Verification:

```bash
sudo ls -l /etc/openclaw-growth/env
```

Example `systemd` unit:

```ini
[Unit]
Description=OpenClaw Growth Runner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/opt/agentic-analytics
EnvironmentFile=/etc/openclaw-growth/env
ExecStart=/usr/bin/node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json --loop
Restart=always
RestartSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/agentic-analytics/data

[Install]
WantedBy=multi-user.target
```

Do not place secret values in unit files, repository files, shell history, or command arguments.

## 4) Validate Before Running

OpenClaw/ClawHub installs can run in two modes:

- Repo mode: local `scripts/openclaw-growth-start.mjs` is available.
- Portable mode: no repo scripts; run setup + first pass directly from `analyticscli` + GitHub API checks.

Portable mode must not ask for manual analytics summary files during `start/run`.
Missing repo scripts alone must not block execution.

Preferred (auto setup + first run orchestration):

```bash
node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json
```

Setup-only (no first run):

```bash
node scripts/openclaw-growth-start.mjs --config data/openclaw-growth-engineer/config.json --setup-only
```

Run preflight:

```bash
node scripts/openclaw-growth-preflight.mjs --config data/openclaw-growth-engineer/config.json --test-connections
```

The check validates:

- config file readability
- source paths/commands
- required binaries (`analyticscli`, `python3`)
- required skill availability (`analyticscli-cli`)
- optional chart dependency (`matplotlib`)
- required env vars for baseline execution (`GITHUB_TOKEN`) and enabled channels
- live connector/API smoke tests for enabled channels

## 5) Data Refresh Workflow

The runner consumes summary files. Update them before each cycle:

- `analytics_summary.json` from AnalyticsCLI queries
- `revenuecat_summary.json` from RevenueCat MCP/agent export
- `sentry_summary.json` from Sentry MCP/agent export
- optional `feedback_summary.json` from support/review aggregation

## 6) Code Readiness Requirements

To ensure reliable file/module mapping:

- run analyzer with `--repo-root <target-repo-root>`
- ensure runner user has read access to that repo
- optionally scope scan with `--code-roots apps,packages`

If code cannot be read, generated issue file mappings are low-confidence.

## 7) Charts (matplotlib)

Generate chart manifest:

```bash
python3 scripts/openclaw-growth-charts.py \
  --analytics data/openclaw-growth-engineer/analytics_summary.json \
  --out-dir data/openclaw-growth-engineer/charts \
  --manifest data/openclaw-growth-engineer/charts.manifest.json
```

Pass manifest to analyzer:

```bash
node scripts/openclaw-growth-engineer.mjs \
  --analytics data/openclaw-growth-engineer/analytics_summary.json \
  --repo-root . \
  --chart-manifest data/openclaw-growth-engineer/charts.manifest.json \
  --max-issues 4
```

## 8) GitHub Issue Creation

Use a fine-grained `GITHUB_TOKEN` (no full-account token needed):

```bash
node scripts/openclaw-growth-engineer.mjs \
  --analytics data/openclaw-growth-engineer/analytics_summary.json \
  --revenuecat data/openclaw-growth-engineer/revenuecat_summary.json \
  --sentry data/openclaw-growth-engineer/sentry_summary.json \
  --repo-root . \
  --create-issues \
  --repo owner/repo \
  --labels ai-growth,autogenerated,product
```

Recommended guardrails:

- max 3-5 issues per run
- `skipIfNoDataChange=true`
- `skipIfIssueSetUnchanged=true`
