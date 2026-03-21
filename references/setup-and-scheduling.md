# Setup And Scheduling Best Practice

## Secret Handling

- Store secrets in OpenClaw secret storage and inject as environment variables at runtime.
- Do not persist API keys in project config files or command arguments.
- Keep config files non-secret and commit-safe.
- Use source-specific env var names:
  - `GITHUB_TOKEN`
  - `ANALYTICSCLI_READONLY_TOKEN`
  - `REVENUECAT_API_KEY`
  - `SENTRY_AUTH_TOKEN`

## Wizard + Config

- Run interactive setup:
  - `node scripts/openclaw-growth-wizard.mjs`
- Wizard writes:
  - `data/openclaw-growth-engineer/config.json`
- Config includes:
  - source connection mode (`file` or `command`)
  - schedule and skip policies
  - issue creation behavior
  - optional chart generation behavior (`charting.enabled`)

## Interval Execution

- Run once:
  - `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json`
- Continuous interval loop:
  - `node scripts/openclaw-growth-runner.mjs --config data/openclaw-growth-engineer/config.json --loop`

## Change Detection

Runner tracks source payload hashes and issue-set fingerprint in:
- `data/openclaw-growth-engineer/state.json`

Skip behavior:
- no source payload change -> skip full analysis (if enabled)
- source changed but issue set unchanged -> skip GitHub issue creation (if enabled)

This keeps cost and noise low while still running on a fixed interval.

## Feedback API (Optional)

Run local feedback ingest API:

- `node scripts/openclaw-feedback-api.mjs --port 4310`

Endpoints:

- `POST /feedback`
- `GET /summary`
- `GET /health`

Optional auth:

- set `FEEDBACK_API_TOKEN`
- send header `x-feedback-token`

If you connect a domain/reverse proxy, point feedback source mode to command:

- `curl -s https://your-domain/summary`

## Charting (Optional)

When `charting.enabled=true`, runner tries to generate charts via:

- default command:
  - `python3 scripts/openclaw-growth-charts.py ...`

Requirements:

- `python3`
- `matplotlib` (`python3 -m pip install matplotlib`)

Generated chart manifest is passed to analyzer and chart images can be embedded in GitHub issues.
