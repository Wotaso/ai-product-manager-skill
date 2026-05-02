---
name: openclaw-growth-engineer
description: OpenClaw-first growth autopilot for mobile apps. Correlate analytics, crashes, billing, feedback, store signals, and repo context into proposal drafts that can flow into OpenClaw chat, GitHub issues, or draft pull requests.
license: MIT
homepage: https://github.com/wotaso/analyticscli-skills
metadata: {"author":"wotaso","version":"1.0.41","analyticscli-target":"@analyticscli/cli","analyticscli-supported-range":">=0.1.2-preview.0 <0.2.0","openclaw":{"emoji":"🚀","homepage":"https://github.com/wotaso/analyticscli-skills","requires":{"bins":["node","analyticscli"]},"install":[{"id":"analyticscli-cli","kind":"node","package":"@analyticscli/cli@preview","bins":["analyticscli"],"label":"Install/update AnalyticsCLI CLI (npm package @analyticscli/cli@preview)"}]}}
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
- Local monorepo path: `pnpm --filter @analyticscli/openclaw-cli dev start --repo-root <repo-root>`
- Legacy copied-runtime scripts under `scripts/openclaw-growth-*.mjs` remain fallback-only for older OpenClaw workspaces

The CLI is intentionally non-AI. OpenClaw should stay the only conversational/implementation layer.
Use the CLI to gather signals, generate proposals, schedule checks, and send deliveries.
If the user later asks OpenClaw to implement a proposal, OpenClaw should inspect the generated drafts and then use its own AI/runtime to do the work.
`openclaw setup` should reuse the existing `analyticscli setup` flow instead of redefining skill installation locally. That means shared skills such as `analyticscli-cli` and `analyticscli-ts-sdk` come from the canonical AnalyticsCLI installer.

## Customization Boundary

Treat this installed skill as vendor-managed and replaceable.
OpenClaw should almost never edit this skill in-place for user- or project-specific customization, because future ClawHub updates may overwrite local changes.
When the user wants custom behavior, create a separate companion skill or project-local customization skill instead, for example `openclaw-growth-custom`, and have that skill reference or layer on top of this one.
Only modify this skill directly when the change is intended as an upstream reusable fix for the canonical skill repository.

## Setup DX Rules

Setup should feel guided for a developer, not like a silent preflight dump.

- Root-cause policy: when connector setup fails for a user, do not hand out VPS-specific workaround commands as the final answer. Fix the reusable AI Growth Engineer skill/CLI/wizard so every future installer gets the corrected flow, then publish/sync the skill and ask the running OpenClaw instance to refetch it.
- Prefer auto-detection and direct fixes over asking the user to run generic commands.
- In chat, explain only what the user needs for the next step. Put provider details, scopes, and secret prompts in the wizard unless the user asks.
- Ask for the minimum missing value only; do not request issue/PR permissions unless artifact creation is enabled.
- For blockers, return one short next action first. Add detailed status, permissions, or URLs only when the user asks or the wizard needs that value.
- After each setup phase, summarize only the result and the next concrete action.
- Keep secrets out of prompts, repo files, logs, and command arguments; prefer OpenClaw secret storage or environment injection.
- Never ask the user to paste API keys, GitHub tokens, or App Store Connect `.p8` private-key contents into Discord, OpenClaw chat, GitHub issues, PRs, or any shared transcript. Discord/chat is not an appropriate secret transport.
- For secrets, give a secure host-terminal path: set env vars in the runtime shell, an OpenClaw secret store, a password manager injection flow, or a locked-down env file such as `~/.config/openclaw-growth/secrets.env` with `chmod 600`. For `.p8`, the terminal wizard must validate pasted file content cryptographically before writing it to `~/.config/openclaw-growth/AuthKey_<KEY_ID>.p8` with `chmod 600`; store only `ASC_PRIVATE_KEY_PATH` and never echo the private key back.
- When SDK instrumentation is missing or weak, guide the developer through the `analyticscli-ts-sdk` setup path so analytics events become useful for later growth analysis.
- If AnalyticsCLI has no default project and multiple projects are visible, do not report that as a hard error. List the available projects, ask the user which one to use, persist the choice with `openclaw start --config openclaw.config.json --project <project_id>` or `analyticscli projects select <project_id>`, and then retry the setup/run.

During setup chat, keep the first answer short. OpenClaw should not dump provider docs, permissions, status history, or troubleshooting unless the user asks for details.

Hard override for AI Growth Engineer connector questions:

If the user says any of these or close variants, apply this override before any generic OpenClaw, AnalyticsCLI, MCP, messaging-channel, or env-var connector knowledge:

- "AI Growth Engineer connectors"
- "analyticscli connectors"
- "AI Product Manager connectors"
- "I want to setup connectors" in the context of this skill
- "which connectors can I set up" in the context of this skill
- "how do I set them up" after asking about this skill's connectors

Answer only with this shape:

```text
AI Growth Engineer connectors:
- AnalyticsCLI product analytics
- GitHub code access
- RevenueCat monetization data
- App Store Connect CLI

Run the wizard on the VPS:
```

```bash
cd /home/lo/.openclaw/workspace && \
  bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh && \
  node scripts/openclaw-growth-wizard.mjs --connectors
```

Then add only: "Select the connectors in the wizard. Secrets stay in the terminal."

Do not list Discord, Telegram, WhatsApp, Slack, Matrix, OpenAI service connectors, MCP servers, browser connectors, Sentry, feedback endpoints, raw environment variables, token scopes, verification commands, or provider URLs in the initial answer. Those details belong inside the wizard or in a direct follow-up answer.


If the user asks a broad question such as "how do I setup everything", answer with only:

```text
Available connectors:
- AnalyticsCLI product analytics
- GitHub code access
- RevenueCat monetization data
- App Store Connect CLI

Run the wizard from the OpenClaw workspace:
```

```bash
cd /home/lo/.openclaw/workspace && \
  bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh && \
  node scripts/openclaw-growth-wizard.mjs --connectors
```

Then add one sentence: "The wizard will ask for the selected connectors and any secrets in the local terminal only."

If the user asks which connectors exist, list only the connector names and one short purpose each. Do not include setup URLs, permissions, token scopes, status history, or validation output in that initial answer.

If the user already names specific connectors, still prefer the checkbox wizard unless they explicitly ask for a non-interactive command. For explicit connector setup, use one copy-paste command with `cd` first:

```bash
cd /home/lo/.openclaw/workspace && \
  bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh && \
  node scripts/openclaw-growth-wizard.mjs --connectors analytics,github,revenuecat,asc
```

Use only the connectors the user accepted. The wizard owns provider-specific instructions, local-terminal secret prompts, helper setup, and smoke tests. Chat should only summarize results after the wizard finishes or when the user asks.

Do not ask for `ASC_APP_ID` during initial setup. ASC summaries default to all accessible App Store Connect apps. A single app ID is only an optional explicit filter later.

Connection setup requests are not satisfied by a successful product-manager run. If the user asks to set up `asc`, App Store Connect, RevenueCat, GitHub, or codebase access, point them to the wizard command above and keep any extra explanation out of chat unless requested.

Reference URLs for the wizard or for explicit follow-up questions:

- RevenueCat dashboard/API keys: https://app.revenuecat.com/
- RevenueCat API key docs: https://www.revenuecat.com/docs/projects/authentication
- RevenueCat MCP setup docs: https://www.revenuecat.com/docs/tools/mcp/setup
- App Store Connect API keys: https://appstoreconnect.apple.com/access/integrations/api
- App Store Connect users/access: https://appstoreconnect.apple.com/access/users
- App Store Connect individual API key profile: https://appstoreconnect.apple.com/account
- GitHub token creation: https://github.com/settings/tokens/new
- GitHub CLI auth docs: https://cli.github.com/manual/gh_auth_login
- GitHub CLI install docs: https://github.com/cli/cli#installation
- GitHub repo settings/apps, for repository-level access checks: https://github.com/settings/installations

Safe secret handoff rules:

- Do not ask the user to send secrets through Discord/OpenClaw chat. It is not safe enough for API keys, GitHub tokens, or `.p8` private keys because messages can be retained, logged, indexed, screenshotted, or visible to other bots/users.
- Ask the user to set secrets directly on the host where OpenClaw runs, then reply only with "done" or the non-sensitive file path/variable name.
- Good terminal pattern for env secrets:
  ```bash
  install -d -m 700 ~/.config/openclaw-growth
  umask 077
  $EDITOR ~/.config/openclaw-growth/secrets.env
  # add lines like:
  # REVENUECAT_API_KEY=...
  # ASC_KEY_ID=...
  # ASC_ISSUER_ID=...
  # ASC_PRIVATE_KEY_PATH=/home/lo/.config/openclaw-growth/AuthKey_XXXX.p8
  chmod 600 ~/.config/openclaw-growth/secrets.env
  ```
- Good `.p8` pattern: paste the full downloaded App Store Connect private key content into the local terminal wizard so it can validate and save `~/.config/openclaw-growth/AuthKey_<KEY_ID>.p8` with `chmod 600`, or save the file yourself and share only `ASC_PRIVATE_KEY_PATH`.
- If OpenClaw runs under systemd, prefer an `EnvironmentFile=` pointing at the `chmod 600` env file and restart the service; never put secrets in command-line args.

## Mandatory Baseline

Before autopilot runs, these are non-negotiable:

- `analyticscli` CLI available
- target repo checkout readable via `project.repoRoot`
- a writable `openclaw.config.json`
- `sources.analytics` enabled

GitHub connection is strongly recommended for serious analysis, even when GitHub delivery is disabled.
Treat readable GitHub repo access as very important because analytics signals become much more actionable when OpenClaw can map funnels, events, crashes, revenue signals, and feedback back to actual code areas.
Without repo context, findings stay generic and file/module hypotheses are lower confidence.

When the user says they want to connect GitHub or the codebase, do not ask them to manually send a repo path first.
Reference and use the dedicated ClawHub GitHub skill when available: `steipete/github` (`https://clawhub.ai/steipete/github`).
It is a `gh` CLI helper skill for issues, PRs, runs, and advanced `gh api` queries, so it should own GitHub command patterns while this skill owns product/growth analysis.
Install or verify it before deeper GitHub setup when OpenClaw can manage skills:

```bash
openclaw skills install steipete/github
# or
npx clawhub@latest install github
```

GitHub setup must go through the connector wizard's classic-token scope guide, not a raw `gh auth login` flow. The wizard should:

1. Detect repo root/remote when useful.
2. Show the classic token URL: `https://github.com/settings/tokens/new`.
3. Explain the relevant scopes briefly: `public_repo`, `repo`, and optional `workflow`.
4. Store `GITHUB_TOKEN` locally when the user pastes it into the terminal wizard.
5. Install `gh` locally only as a helper binary; do not use GitHub CLI OAuth as the default credential path because it can request broad repository/workflow permissions.
6. Tell the user they can rerun the wizard later to change GitHub permissions.

Use least privilege:

- public repo context only: `public_repo`
- private repo access or private issue/PR work: `repo` (classic tokens make this broad)
- workflow permission: add `workflow` only when the user explicitly wants OpenClaw to edit GitHub Actions workflow files
- avoid packages, admin/org, hooks, gist, user, delete_repo, enterprise, codespace, and copilot scopes unless explicitly needed

## Dependency Refresh Protocol

Run this protocol at the start of every setup/start/run request, and whenever the user asks to fetch, update, upgrade, or reinstall this skill.
Do not stop after saying the skill was fetched from ClawHub.
The job is not done until the npm binary and companion skills are updated and verified.
If the user reports `analyticscli: command not found` in their own terminal, treat that as unresolved even if `analyticscli` works inside OpenClaw's child process.
Child processes cannot mutate the PATH of an already-open parent terminal.

1. Refresh this ClawHub skill:
   ```bash
   npx -y clawhub install ai-product-manager
   ```
2. Refresh the AnalyticsCLI agent skill only when it can run non-interactively:
   ```bash
   npx -y skills add wotaso/analyticscli-skills --skill analyticscli-cli
   ```
   If this command asks an interactive agent-selection question, stop that command and continue with the npm package install instead of blocking.
   Do not describe an interactive `skills add` prompt as a successful refresh.
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
Find the user-local binary and fix PATH for future shells yourself; do not bounce this step back to the user:

```bash
export PATH="$HOME/.local/bin:$HOME/.local/analyticscli-npm/bin:$PATH"
command -v analyticscli || ls -l "$HOME/.local/bin/analyticscli" "$HOME/.local/analyticscli-npm/bin/analyticscli"
```

If the binary exists under `$HOME/.local/bin` or `$HOME/.local/analyticscli-npm/bin`, make future shells pick it up. Update all common shell startup files idempotently, then verify from a fresh shell:

```bash
for f in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.zshrc" "$HOME/.zprofile"; do
  touch "$f"
  grep -Fq 'export PATH="$HOME/.local/bin:$HOME/.local/analyticscli-npm/bin:$PATH"' "$f" ||
    printf '\n# AnalyticsCLI CLI user-local npm bin\nexport PATH="$HOME/.local/bin:$HOME/.local/analyticscli-npm/bin:$PATH"\n' >> "$f"
done
bash -lc 'source "$HOME/.bashrc" 2>/dev/null || true; source "$HOME/.profile" 2>/dev/null || true; command -v analyticscli && analyticscli --help >/dev/null'
```

Child processes cannot mutate an already-open parent terminal. Say that only as residual context after you have already updated profile files and verified a fresh shell. Do not say "analyticscli is fixed" unless this exact command succeeds in the same command context you control:

```bash
command -v analyticscli && analyticscli --help >/dev/null
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
It must also update common shell profile files and verify that a fresh shell can resolve `analyticscli`.
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

For iOS/macOS products, explicitly ask whether the user wants to connect the `asc` CLI and the related App Store Connect agent skill. ASC means App Store Connect, not analytics.
Never abbreviate this as just "analytics" in status messages, because it is easy to confuse with AnalyticsCLI.
Say "ASC / App Store Connect" when referring to `asc`, and "AnalyticsCLI baseline" when referring to the AnalyticsCLI project.
An AnalyticsCLI auth check, selected AnalyticsCLI project, or successful PM run does not prove that ASC is connected.
Only say ASC is connected after `asc` auth is configured, the App Store Connect app id is known, and a read-only ASC command/export has succeeded.
Frame ASC as an App Store Connect connector, not as a synonym for analytics. AnalyticsCLI remains the product analytics baseline; App Store Connect reports can optionally add discovery, downloads, usage, purchase, subscription, ratings, reviews, release, build, and TestFlight context.
Do not request ASC permissions for release management, TestFlight management, pricing changes, user management, or other write/admin workflows when the user only selected read-only App Store Connect reporting.
Reference the ASC skill pack as the canonical companion skills for `asc`: `rorkai/app-store-connect-cli-skills` (`https://github.com/rorkai/app-store-connect-cli-skills`).
Use it for `asc` command syntax, auth, pagination, ID resolution, and App Store Connect workflows; for read-only App Store Connect reporting prefer the least invasive skills such as `asc-cli-usage` and `asc-id-resolver`, not release/submission/signing skills.
Install or refresh it when the user selects ASC:

```bash
npx skills add rorkai/app-store-connect-cli-skills
```

ASC setup guidance:

- Ask: "Soll ASC CLI fuer App Store Connect verbunden werden?"
- Send the user to exactly this page to create the key: https://appstoreconnect.apple.com/access/integrations/api.
- Say the main role is `Sales`, required for App Analytics, Sales and Trends, downloads, revenue, and conversion context. Add `Customer Support` for App Store ratings/review text, `Developer` for builds/TestFlight/delivery status, and `App Manager` only when app metadata, pricing, or release settings are needed. Avoid `Admin` unless a one-off App Store Connect permission requires it.
- Tell the user to copy `ASC_ISSUER_ID` from the API keys page, copy `ASC_KEY_ID` from the key row or downloaded `AuthKey_<KEY_ID>.p8` file name, download the `.p8`, open it, and paste the full file content into the local terminal wizard.
- Store only env vars/secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY_PATH`; the wizard can create the `.p8` file from validated pasted terminal content. Never commit the `.p8` private key.
- Do not ask for `ASC_APP_ID` upfront. After auth succeeds, ASC should use all accessible apps by default. Store an app filter only if the user explicitly asks to scope ASC to one app.
- After the key is present and the target app is inferred or selected, run one read-only `asc` smoke test before marking ASC connected.
- Prefer `asc auth login` when the local `asc` CLI supports keychain storage; otherwise use runtime env injection.

RevenueCat setup guidance:

- Ask: "Soll RevenueCat fuer Monetization-/Subscription-Daten verbunden werden?"
- For SDK instrumentation, use the public app-specific SDK key only in the app.
- For server-side growth summaries, request a RevenueCat secret API key stored server-side only. Tell the user to generate a new secret API key named `analyticscli`, choose API version 2, and set Charts metrics, Customer information, and Project configuration permissions to read.
- Tell the user to open https://app.revenuecat.com/, select the app, then choose "Apps & providers" in the sidebar and click "API keys". Do not ask for a RevenueCat project id just to build a deep link.
- Store it as `REVENUECAT_API_KEY` in OpenClaw secret storage or runtime env; never put it in client code, config JSON, issues, or PR bodies.

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
   - `pnpm --filter @analyticscli/openclaw-cli dev start --repo-root <repo-root>`
5. Run portable checks first when setup is incomplete:
   - `command -v analyticscli`
   - `analyticscli projects list`
   - detect `project.githubRepo` from git remote when possible
   - verify readable GitHub repo access when available so analytics findings can be mapped to code
   - verify GitHub issue/PR write scopes only if GitHub delivery is enabled
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
  - strongly recommended with readable repo/code access for code-aware analysis
  - required with write scopes only when GitHub issue or pull-request delivery is enabled
  - use the classic token page at `https://github.com/settings/tokens/new`; use `public_repo` for public repos, `repo` for private repo access, and `workflow` only for GitHub Actions workflow edits
  - issue mode: add `Issues: Read/Write` only when issue creation is enabled
  - pull-request mode: add `Pull requests: Read/Write` and `Contents: Read/Write` only when draft PR creation is enabled
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH`
  - optional; ask before setup
  - App Store Connect analytics first, plus optional reviews, builds, TestFlight, and store context
  - require Sales; add Customer Support for reviews, Developer for builds/TestFlight, and App Manager only for app metadata/pricing/release settings
- `ANALYTICSCLI_ACCESS_TOKEN`
  - recommended for CLI/agent auth when no local CLI login exists
  - do not ask for `ANALYTICSCLI_READONLY_TOKEN`; the readonly token is passed to `analyticscli login --readonly-token <token>` or stored as `ANALYTICSCLI_ACCESS_TOKEN`
- `REVENUECAT_API_KEY`
  - optional; ask before setup
  - use a server-side secret API key for RevenueCat command/API mode
  - prefer v2 read permissions for charts/metrics and required project configuration resources
- `SENTRY_AUTH_TOKEN`
  - recommended for Sentry command/API mode
- optional connector-specific `secretEnv` per `sources.extra[]`

## References

- [README](README.md)
- [Setup And Scheduling](references/setup-and-scheduling.md)
- [Required Secrets](references/required-secrets.md)
- [Input Schema](references/input-schema.md)
- [Issue Template](references/issue-template.md)
