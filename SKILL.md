---
name: openclaw-growth-engineer
description: OpenClaw-first growth autopilot for mobile apps. Correlate analytics, crashes, billing, feedback, store signals, and repo context into proposal drafts that can flow into OpenClaw chat, GitHub issues, or draft pull requests.
license: MIT
homepage: https://github.com/wotaso/analyticscli-skills
metadata: {"author":"wotaso","version":"1.0.24","analyticscli-target":"@analyticscli/cli","analyticscli-supported-range":">=0.1.2-preview.0 <0.2.0","openclaw":{"emoji":"🚀","homepage":"https://github.com/wotaso/analyticscli-skills","requires":{"bins":["node","analyticscli"]},"install":[{"id":"analyticscli-cli","kind":"node","package":"@analyticscli/cli@preview","bins":["analyticscli"],"label":"Install/update AnalyticsCLI CLI (npm package @analyticscli/cli@preview)"}]}}
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

- Prefer auto-detection and direct fixes over asking the user to run generic commands.
- Explain why each connection matters before asking for it, especially AnalyticsCLI auth, GitHub code access, and optional GitHub write scopes.
- Ask for the minimum missing value only; do not request issue/PR permissions unless artifact creation is enabled.
- For every blocker, return a compact checklist with status, why it matters, where to get it, and the exact minimum permission or command.
- Always include direct URLs for external dashboards/settings pages whenever the user must create a key, token, app id, or grant access. Use URLs in addition to menu paths.
- After each setup phase, report what was detected, what was configured, and the next concrete command OpenClaw will run.
- Keep secrets out of prompts, repo files, logs, and command arguments; prefer OpenClaw secret storage or environment injection.
- Never ask the user to paste API keys, GitHub tokens, or App Store Connect `.p8` private-key contents into Discord, OpenClaw chat, GitHub issues, PRs, or any shared transcript. Discord/chat is not an appropriate secret transport.
- For secrets, give a secure host-terminal path: set env vars in the runtime shell, an OpenClaw secret store, a password manager injection flow, or a locked-down env file such as `~/.config/openclaw-growth/secrets.env` with `chmod 600`. For `.p8`, prefer writing the file on the host with `umask 077`, store only its path as `ASC_PRIVATE_KEY_PATH`, and never echo the private key back.
- When SDK instrumentation is missing or weak, guide the developer through the `analyticscli-ts-sdk` setup path so analytics events become useful for later growth analysis.
- If AnalyticsCLI has no default project and multiple projects are visible, do not report that as a hard error. List the available projects, ask the user which one to use, persist the choice with `openclaw start --config openclaw.config.json --project <project_id>` or `analyticscli projects select <project_id>`, and then retry the setup/run.

During setup, ask the user this concrete selection question before requesting optional credentials:

```text
Welche der folgenden Connections moechtest du aufsetzen? Mehrfachauswahl ist moeglich:
1. AnalyticsCLI analytics baseline
2. GitHub code access fuer Codeanalyse
3. ASC CLI fuer App Store Connect
4. RevenueCat fuer Monetization-/Subscription-Daten
5. Sentry/GlitchTip fuer Crash-/Error-Daten
6. Feedback/App Reviews
7. Erstmal ueberspringen
```

Then configure only the selected connections. Do not ask for all tokens at once.
For every selected connection, explain the minimum role/scope and exactly where the user finds the key or login flow.
If the user already says which connections they want, treat those as selected and start setup immediately. For example, "I want to connect ASC + codebase from GitHub" means configure App Store Connect (ASC) access and GitHub code access; do not respond by asking for a repo path first, and do not claim ASC is connected merely because AnalyticsCLI works.

Developer-facing setup conversation contract:

- Talk like a setup guide, not a reference manual.
- Start with the current status for each selected connector: helper installed, credentials missing, smoke test pending, or connected.
- For every missing credential, provide the direct URL, the exact minimum permission, and the safe handoff method.
- Never ask "send me the key", "paste the token", or "upload the .p8 here". Instead say "set this on the host and reply done".
- Give copy-paste-safe host commands that do not include secret values.
- Do not ask for `ASC_APP_ID` during initial setup. After ASC auth works, list/infer apps. If the target is ambiguous, ask for the app name first; only ask for a numeric app id if app-name resolution fails.
- End with the next command OpenClaw will run after the developer says "done".

Use this high-level response shape when a developer asks to set up RevenueCat + ASC + GitHub:

```text
I will not ask you to paste secrets into Discord/OpenClaw chat.

1. RevenueCat
Status: helper installed/not installed; not connected until read-only smoke test passes.
Create key: https://app.revenuecat.com/projects/<project_id>/api-keys
If you do not know the project id, open https://app.revenuecat.com/ and select the project.
Minimum permissions: v2 secret key, read-only for charts/metrics and apps/products/offerings/packages/entitlements.
Safe handoff: set REVENUECAT_API_KEY on the OpenClaw host or in ~/.config/openclaw-growth/secrets.env with chmod 600, then reply "done".

2. ASC / App Store Connect
Status: helper installed/not installed; not connected until ASC auth and read-only list/export smoke test passes.
Create key: https://appstoreconnect.apple.com/access/integrations/api
Access/users: https://appstoreconnect.apple.com/access/users
Minimum permissions: least read/reporting role that can read the needed reports; avoid Admin unless temporarily required.
Safe handoff: save the .p8 on the host as ~/.config/openclaw-growth/AuthKey_<KEY_ID>.p8 with chmod 600, set ASC_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_PATH. Do not paste .p8 contents into chat.
App selection: no app id needed now. After auth I will list/infer apps; if unclear I will ask for the app name.

3. GitHub code access
Status: helper installed/not installed; not connected until gh auth status succeeds and repo/code is readable.
CLI auth: gh auth login
Token fallback: https://github.com/settings/personal-access-tokens/new
Minimum permissions: Metadata: Read + Contents: Read for the selected repo. No issue/PR write unless delivery is enabled.
Safe handoff: authenticate gh on the host or store a fine-grained token in the host secret store; do not paste it into chat.
```

After the AnalyticsCLI baseline is working, always offer these high-impact context connectors explicitly, even if the user did not mention them yet:

```text
AnalyticsCLI baseline is connected. Do you want to add any of these high-impact context connectors now?
1. RevenueCat for monetization/subscription data
2. ASC / App Store Connect for store, subscription, rating, review, build, and TestFlight context
3. GitHub code access so findings can be mapped to the real codebase
```

If the user says yes, "all", "RevenueCat + App Store Connect + GitHub", or names any of these connectors, treat that as an explicit selection and immediately provide the connector-specific setup instructions below.
Do not ask another vague "what do you want to connect?" question after the user accepts.
Walk connector-by-connector, request only the next missing value in a local terminal wizard, and mark a connector connected only after its read-only smoke test succeeds.
For connector setup, use the interactive wizard as the only user-facing setup path. Do not ask the user to manually compose the raw `openclaw-growth-start.mjs --connectors ...` command. Bootstrap the runtime first, then run the connector wizard:

```bash
bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh
node scripts/openclaw-growth-wizard.mjs --connectors revenuecat,asc,github
```

Use only the connectors the user accepted. The wizard explains the selected provider steps, asks for local-terminal input/multiple choice selections, saves host-local secrets, enables the selected connector stubs in config, and runs helper setup for GitHub helper skill + `gh`, ASC skill pack + `asc`, and RevenueCat MCP transport/config.
Do not use bare `openclaw setup --config ...` on OpenClaw hosts unless you have verified it is the AI Product Manager CLI; on many hosts `openclaw` is the core OpenClaw CLI and will reject `--config`.
In the Agentic Analytics monorepo only, use `pnpm --filter @analyticscli/openclaw-cli dev setup --repo-root <repo-root> --skip-shared-skills --connectors <list>`.
If helper installation fails, report the failed helper and exact next install command, then continue with the other selected connectors.

Connection setup requests are not satisfied by a successful product-manager run.
If the user asks to set up `asc`, App Store Connect, RevenueCat, GitHub, or codebase access, always answer with the concrete setup status and the mini step-by-step instructions for the requested connectors.
Do not respond with only "run succeeds", "No data changes", or "everything is healthy".

Use this response shape for "setup revenuecat asc and gh" or similar requests:

```text
RevenueCat setup:
1. Run: bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh, then node scripts/openclaw-growth-wizard.mjs --connectors revenuecat
2. Create a RevenueCat secret API key at https://app.revenuecat.com/projects/<project_id>/api-keys, replacing `<project_id>` with the RevenueCat project id. If the id is unknown, open https://app.revenuecat.com/ and select the project first.
3. For growth analysis, prefer a v2 secret key with read-only permissions for charts/metrics plus project configuration resources such as apps, products, offerings, packages, and entitlements. Add customer/subscriber read only if the selected report needs it.
4. Paste the key only when the wizard asks in the host terminal. Do not paste it into Discord/OpenClaw chat. Never put it in client code, config JSON, issues, PR bodies, command history, or logs.
5. Let the wizard write the local secrets file, run helper setup, and then smoke test with a read-only RevenueCat MCP/API call.

ASC means App Store Connect. It does not mean analytics. ASC is separate from AnalyticsCLI, and AnalyticsCLI working does not mean App Store Connect is connected.

ASC setup:
1. Run: bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh, then node scripts/openclaw-growth-wizard.mjs --connectors asc
2. This installs/verifies the ASC skill pack and `asc` CLI when possible.
3. Create an App Store Connect API key at https://appstoreconnect.apple.com/access/integrations/api or https://appstoreconnect.apple.com/access/users for team access. For read-only App Store Connect reporting, use the least role that can read the required reports for the target app; prefer Sales/Sales and Reports style access, use Finance only if needed, avoid Admin unless a report must be enabled once.
4. Paste `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY_PATH` only when the wizard asks in the host terminal. Put the `.p8` on the host with permissions `600`, not in Discord/chat, not in git, and not in logs. Use `ASC_PRIVATE_KEY` only if the secret store supports multiline values safely.
5. Do not ask for `ASC_APP_ID` upfront. After auth succeeds, list/infer apps from ASC; if unclear, ask for the app name before asking for any numeric id.
6. Smoke test with asc auth/status or a read-only list/export command, then wire the exported JSON as an extra source.

GitHub setup:
1. Run: bash skills/ai-product-manager/scripts/bootstrap-openclaw-workspace.sh, then node scripts/openclaw-growth-wizard.mjs --connectors github
2. This installs/verifies the GitHub helper skill and `gh` CLI when possible.
3. Detect repo locally: git rev-parse --show-toplevel and git remote get-url origin
4. Check auth: gh auth status; if missing, run gh auth login.
5. For code analysis only, read-only repo access is enough. If a token is needed, create one at https://github.com/settings/personal-access-tokens/new with Contents: Read and Metadata: Read for the selected repos.
6. Only add Issues write or Pull requests/Contents write if the user wants OpenClaw to create issues or draft PRs.
```

Direct connector URLs to show the user when relevant:

- RevenueCat dashboard/API keys: https://app.revenuecat.com/projects/<project_id>/api-keys
- RevenueCat dashboard project picker: https://app.revenuecat.com/
- RevenueCat API key docs: https://www.revenuecat.com/docs/projects/authentication
- RevenueCat MCP setup docs: https://www.revenuecat.com/docs/tools/mcp/setup
- App Store Connect API keys: https://appstoreconnect.apple.com/access/integrations/api
- App Store Connect users/access: https://appstoreconnect.apple.com/access/users
- App Store Connect individual API key profile: https://appstoreconnect.apple.com/account
- GitHub fine-grained token creation: https://github.com/settings/personal-access-tokens/new
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
- Good `.p8` pattern: save the downloaded App Store Connect private key directly to `~/.config/openclaw-growth/AuthKey_<KEY_ID>.p8`, run `chmod 600` on it, and share only `ASC_PRIVATE_KEY_PATH`.
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

Start the GitHub CLI setup flow yourself:

1. Run `git rev-parse --show-toplevel` to detect the local repo root.
2. Run `git remote get-url origin` and infer `owner/repo` when possible.
3. Run `gh auth status`.
4. If `gh` is not authenticated, start `gh auth login` and tell the user to complete the browser/device flow.
5. After auth succeeds, use local repo context for read-only code analysis immediately.
6. Ask for issue or pull-request write permissions only if GitHub delivery is enabled.

If GitHub auth is missing, do not stop at "GitHub is blocked" or "no GitHub auth configured".
Either start the login flow directly with `gh auth login`, or, if the runtime cannot run interactive auth, print the exact next steps:

```text
GitHub is not connected yet.
1. Run: gh auth login
2. Choose GitHub.com.
3. Prefer HTTPS unless the repo already uses SSH.
4. For code analysis only, read-only repo access is enough.
5. If issue creation is desired, add Issues read/write.
6. If draft PR creation is desired, add Pull requests read/write and Contents read/write.
7. Verify with: gh auth status
```

Use the least privilege GitHub access that matches the requested workflow:

- code analysis only: readable repo/code access is enough; prefer `gh auth status` / `gh auth login` when an existing GitHub CLI login can be reused
- if the user must create a token, prefer a fine-grained read-only token with `Contents: Read` and `Metadata: Read`, and ask for access to all repositories only when the user wants cross-repo code analysis
- issue creation: add issue write permission only when GitHub issue delivery is enabled
- pull-request creation: add pull-request and contents write permission only when draft PR delivery is enabled

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
- Recommend the least-privilege App Store Connect API access that can read the required App Store Connect reports: prefer a Sales/Sales and Reports style role for generated reports; Finance can work but is broader; Admin should only be used temporarily when a new report type must be requested for the first time.
- Prefer an individual API key for a user limited to the target app when possible; team API keys can cover all apps and are broader.
- Tell the user where to create the key and include direct URLs: https://appstoreconnect.apple.com/access/integrations/api for team keys, https://appstoreconnect.apple.com/access/users for access management, or https://appstoreconnect.apple.com/account for individual keys.
- Store only env vars/secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY` or `ASC_PRIVATE_KEY_PATH`; never commit the `.p8` private key.
- Do not ask for `ASC_APP_ID` upfront. After auth succeeds, auto-detect/list apps; if ambiguous, ask for the app name first. Store `ASC_APP_ID` only after it has been resolved.
- After the key is present and the target app is inferred or selected, run one read-only `asc` smoke test before marking ASC connected.
- Prefer `asc auth login` when the local `asc` CLI supports keychain storage; otherwise use runtime env injection.

RevenueCat setup guidance:

- Ask: "Soll RevenueCat fuer Monetization-/Subscription-Daten verbunden werden?"
- For SDK instrumentation, use the public app-specific SDK key only in the app.
- For server-side growth summaries, request a RevenueCat secret API key stored server-side only. Prefer a v2 secret key with read-only permissions for charts/metrics and required project configuration resources such as apps, products, offerings, packages, and entitlements; add customer/subscriber read only if the selected summary needs it.
- Tell the user where to create it and include direct URLs: https://app.revenuecat.com/projects/<project_id>/api-keys, replacing `<project_id>` with the RevenueCat project id; if unknown, start at https://app.revenuecat.com/. Include https://www.revenuecat.com/docs/projects/authentication for key docs.
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
  - prefer GitHub CLI auth; if a token is needed for analysis, use fine-grained read-only `Contents: Read` and `Metadata: Read`
  - issue mode: add `Issues: Read/Write` only when issue creation is enabled
  - pull-request mode: add `Pull requests: Read/Write` and `Contents: Read/Write` only when draft PR creation is enabled
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` or `ASC_PRIVATE_KEY_PATH`
  - optional; ask before setup
  - App Store Connect read-only reporting data only
  - prefer Sales/Sales and Reports style access; Admin only temporarily for first-time report type requests
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
