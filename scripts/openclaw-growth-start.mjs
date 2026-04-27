#!/usr/bin/env node
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { getActionMode, getDefaultSourceCommand } from './openclaw-growth-shared.mjs';
const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const DEFAULT_TEMPLATE_PATH = 'data/openclaw-growth-engineer/config.example.json';
const ANALYTICSCLI_PACKAGE_SPEC = process.env.ANALYTICSCLI_CLI_PACKAGE || '@analyticscli/cli@preview';
const ANALYTICSCLI_NPM_PREFIX = process.env.ANALYTICSCLI_NPM_PREFIX ||
    (process.env.HOME ? path.join(process.env.HOME, '.local') : path.join(process.cwd(), '.analyticscli-npm'));
function printHelpAndExit(exitCode, reason = null) {
    if (reason) {
        process.stderr.write(`${reason}\n\n`);
    }
    process.stdout.write(`
OpenClaw Growth Start

Bootstraps setup and first run in one deterministic flow:
1) Ensure config exists (auto-bootstrap from template when missing)
2) Run preflight
3) If preflight passes, run first pass

Usage:
  node scripts/openclaw-growth-start.mjs [options]

Options:
  --config <file>        Config path (default: ${DEFAULT_CONFIG_PATH})
  --setup-only           Run bootstrap + preflight only (skip first run)
  --no-test-connections  Skip live API smoke checks in preflight
  --help, -h             Show help
`);
    process.exit(exitCode);
}
function parseArgs(argv) {
    const args = {
        config: DEFAULT_CONFIG_PATH,
        run: true,
        testConnections: true,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        const next = argv[i + 1];
        if (token === '--') {
            continue;
        }
        else if (token === '--config') {
            args.config = next || args.config;
            i += 1;
        }
        else if (token === '--setup-only') {
            args.run = false;
        }
        else if (token === '--no-test-connections') {
            args.testConnections = false;
        }
        else if (token === '--help' || token === '-h') {
            printHelpAndExit(0);
        }
        else {
            printHelpAndExit(1, `Unknown argument: ${token}`);
        }
    }
    return args;
}
function quote(value) {
    if (/^[a-zA-Z0-9_./:-]+$/.test(String(value))) {
        return String(value);
    }
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
function truncate(value, max = 240) {
    const text = String(value || '');
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}...`;
}
function resolveShellCommand() {
    const candidates = [
        process.env.OPENCLAW_SHELL,
        process.env.SHELL,
        '/bin/zsh',
        '/bin/bash',
        '/usr/bin/bash',
        '/bin/sh',
        '/usr/bin/sh',
    ].filter((value) => typeof value === 'string' && value.trim().length > 0);
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return 'sh';
}
function runShellCommand(command, timeoutMs = 120_000) {
    return new Promise((resolve) => {
        const child = spawn(resolveShellCommand(), ['-c', command], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGTERM');
            resolve({
                ok: false,
                code: null,
                stdout,
                stderr: `${stderr}\nTimed out after ${timeoutMs}ms`,
            });
        }, timeoutMs);
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({
                ok: code === 0,
                code,
                stdout,
                stderr,
            });
        });
    });
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function commandExists(commandName) {
    const result = await runShellCommand(`command -v ${quote(commandName)} >/dev/null 2>&1`, 30_000);
    return result.ok;
}
async function resolveCommandPath(commandName) {
    const result = await runShellCommand(`command -v ${quote(commandName)}`, 30_000);
    return result.ok ? result.stdout.trim() : null;
}
function prependToPath(binDir) {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
}
function getPathProfileEntries(binDir) {
    const entries = [binDir];
    if (process.env.HOME && path.resolve(binDir) === path.resolve(process.env.HOME, '.local', 'bin')) {
        entries.push(path.join(process.env.HOME, '.local', 'analyticscli-npm', 'bin'));
    }
    return entries;
}
function renderProfilePathEntries(binDir) {
    const home = process.env.HOME ? path.resolve(process.env.HOME) : null;
    return getPathProfileEntries(binDir)
        .map((entry) => {
        const resolved = path.resolve(entry);
        if (home && (resolved === home || resolved.startsWith(`${home}${path.sep}`))) {
            return `$HOME/${path.relative(home, resolved)}`;
        }
        return entry;
    })
        .join(':');
}
async function ensureProfilePath(binDir) {
    if (process.env.ANALYTICSCLI_SKIP_PROFILE_UPDATE === 'true' || !process.env.HOME) {
        return false;
    }
    const line = `export PATH="${renderProfilePathEntries(binDir)}:$PATH"`;
    const profiles = ['.profile', '.bashrc', '.bash_profile', '.zshrc', '.zprofile'].map((name) => path.join(process.env.HOME, name));
    let wrote = false;
    for (const profile of profiles) {
        let current = '';
        try {
            current = await fs.readFile(profile, 'utf8');
        }
        catch {
            await fs.mkdir(path.dirname(profile), { recursive: true });
        }
        if (!current.includes(line)) {
            await fs.appendFile(profile, `\n# AnalyticsCLI CLI user-local npm bin\n${line}\n`, 'utf8');
            wrote = true;
        }
    }
    return wrote;
}
async function verifyFreshShellProfile() {
    if (!process.env.HOME) {
        return false;
    }
    const cleanPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    const probes = [
        {
            shell: '/bin/bash',
            command: 'for f in "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
        },
        {
            shell: '/usr/bin/bash',
            command: 'for f in "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
        },
        {
            shell: '/bin/zsh',
            command: 'for f in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
        },
        {
            shell: '/usr/bin/zsh',
            command: 'for f in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
        },
        {
            shell: '/bin/sh',
            command: '[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1 || true; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
        },
        {
            shell: '/usr/bin/sh',
            command: '[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1 || true; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
        },
    ];
    for (const probe of probes) {
        if (!(await fileExists(probe.shell))) {
            continue;
        }
        const result = await runShellCommand(`env HOME=${quote(process.env.HOME)} PATH=${quote(cleanPath)} ${quote(probe.shell)} -lc ${quote(probe.command)}`, 30_000);
        if (result.ok) {
            return true;
        }
    }
    return false;
}
function isUserLocalBin(binDir) {
    if (!process.env.HOME) {
        return false;
    }
    const home = path.resolve(process.env.HOME);
    const resolved = path.resolve(binDir);
    return resolved === home || resolved.startsWith(`${home}${path.sep}`);
}
function isPermissionFailure(output) {
    return /EACCES|permission denied|access denied|operation not permitted/i.test(String(output || ''));
}
async function ensureAnalyticsCliInstalled() {
    const beforePath = await resolveCommandPath('analyticscli');
    const npmExists = await commandExists('npm');
    if (!npmExists) {
        if (beforePath) {
            return {
                ok: true,
                detail: `analyticscli binary found at ${beforePath}; npm unavailable, so package update was skipped`,
            };
        }
        return {
            ok: false,
            detail: `analyticscli binary missing and npm is unavailable; install ${ANALYTICSCLI_PACKAGE_SPEC}`,
        };
    }
    const globalInstall = await runShellCommand(`npm install -g ${quote(ANALYTICSCLI_PACKAGE_SPEC)}`, 180_000);
    if (!globalInstall.ok) {
        const installOutput = `${globalInstall.stderr}\n${globalInstall.stdout}`;
        if (isPermissionFailure(installOutput)) {
            await fs.mkdir(ANALYTICSCLI_NPM_PREFIX, { recursive: true });
            const localInstall = await runShellCommand(`npm install -g --prefix ${quote(ANALYTICSCLI_NPM_PREFIX)} ${quote(ANALYTICSCLI_PACKAGE_SPEC)}`, 180_000);
            if (!localInstall.ok) {
                return beforePath
                    ? {
                        ok: true,
                        detail: `analyticscli binary found at ${beforePath}; update failed globally and in user-local prefix (${truncate(localInstall.stderr || localInstall.stdout)})`,
                    }
                    : {
                        ok: false,
                        detail: `npm install failed globally and in user-local prefix ${ANALYTICSCLI_NPM_PREFIX}: ${truncate(localInstall.stderr || localInstall.stdout)}`,
                    };
            }
            const localBinDir = path.join(ANALYTICSCLI_NPM_PREFIX, 'bin');
            prependToPath(localBinDir);
            await ensureProfilePath(localBinDir);
        }
        else {
            return beforePath
                ? {
                    ok: true,
                    detail: `analyticscli binary found at ${beforePath}; package update failed (${truncate(installOutput)})`,
                }
                : {
                    ok: false,
                    detail: `npm install -g ${ANALYTICSCLI_PACKAGE_SPEC} failed: ${truncate(installOutput)}`,
                };
        }
    }
    const afterPath = await resolveCommandPath('analyticscli');
    if (afterPath) {
        const helpCheck = await runShellCommand('analyticscli --help >/dev/null 2>&1', 30_000);
        if (!helpCheck.ok) {
            return {
                ok: false,
                detail: `analyticscli binary found at ${afterPath}, but --help failed: ${truncate(helpCheck.stderr || helpCheck.stdout)}`,
            };
        }
        const binDir = path.dirname(afterPath);
        if (isUserLocalBin(binDir)) {
            await ensureProfilePath(binDir);
            if (!(await verifyFreshShellProfile())) {
                return {
                    ok: false,
                    detail: `analyticscli works at ${afterPath}, but a fresh shell still cannot resolve it after profile update; add ${renderProfilePathEntries(binDir)} to PATH`,
                };
            }
            return {
                ok: true,
                detail: `analyticscli package ensured via ${ANALYTICSCLI_PACKAGE_SPEC}; binary found at ${afterPath}; shell profiles updated and fresh shell verification passed`,
            };
        }
    }
    return afterPath
        ? {
            ok: true,
            detail: `analyticscli package ensured via ${ANALYTICSCLI_PACKAGE_SPEC}; binary found at ${afterPath}`,
        }
        : {
            ok: false,
            detail: `Installed ${ANALYTICSCLI_PACKAGE_SPEC}, but analyticscli is still not on PATH`,
        };
}
async function readJson(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
}
async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function parseGitHubRepoFromRemote(remoteUrl) {
    const value = String(remoteUrl || '').trim();
    if (!value)
        return null;
    const sshMatch = value.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
    if (sshMatch)
        return sshMatch[1];
    const httpsMatch = value.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
    if (httpsMatch)
        return httpsMatch[1];
    return null;
}
async function detectGitHubRepo() {
    const explicit = String(process.env.OPENCLAW_GITHUB_REPO || '').trim();
    if (explicit)
        return explicit;
    const remoteResult = await runShellCommand('git config --get remote.origin.url', 10_000);
    if (!remoteResult.ok)
        return null;
    return parseGitHubRepoFromRemote(remoteResult.stdout.trim());
}
async function ensureConfig(configPath) {
    if (await fileExists(configPath)) {
        return {
            created: false,
            configPath,
            githubRepo: null,
        };
    }
    const templatePath = path.resolve(DEFAULT_TEMPLATE_PATH);
    const template = await readJson(templatePath);
    const detectedRepo = await detectGitHubRepo();
    const githubRepo = detectedRepo || String(template.project?.githubRepo || 'owner/repo');
    const config = {
        ...template,
        generatedAt: new Date().toISOString(),
        project: {
            ...template.project,
            githubRepo,
            repoRoot: '.',
        },
        sources: {
            ...template.sources,
            analytics: {
                enabled: true,
                mode: 'command',
                command: getDefaultSourceCommand('analytics'),
            },
            revenuecat: {
                ...(template.sources?.revenuecat || {}),
                enabled: false,
            },
            sentry: {
                ...(template.sources?.sentry || {}),
                enabled: false,
            },
            feedback: {
                ...(template.sources?.feedback || {}),
                enabled: false,
            },
            extra: Array.isArray(template.sources?.extra) ? template.sources.extra : [],
        },
        actions: {
            ...template.actions,
            mode: 'issue',
            autoCreateIssues: false,
            autoCreatePullRequests: false,
            draftPullRequests: true,
            proposalBranchPrefix: 'openclaw/proposals',
        },
    };
    await writeJson(configPath, config);
    return {
        created: true,
        configPath,
        githubRepo,
    };
}
function parseJsonFromStdout(stdout) {
    const raw = String(stdout || '').trim();
    if (!raw)
        return null;
    const firstBrace = raw.indexOf('{');
    if (firstBrace < 0)
        return null;
    try {
        return JSON.parse(raw.slice(firstBrace));
    }
    catch {
        return null;
    }
}
function remediationForCheck(checkName, configPath) {
    if (checkName === 'dependency:analyticscli') {
        return 'Run AnalyticsCLI CLI with `npx -y @analyticscli/cli@preview --help`, or use `@analyticscli/cli` after stable release.';
    }
    if (checkName === 'project:github-repo') {
        return `Set \`project.githubRepo\` in ${configPath} (owner/repo).`;
    }
    if (checkName.startsWith('secret:GITHUB_TOKEN')) {
        return 'Set `GITHUB_TOKEN` (fine-grained PAT with repository `Issues: Read/Write` and `Contents: Read`).';
    }
    if (checkName === 'source:analytics:file') {
        return 'Write `data/openclaw-growth-engineer/analytics_summary.json` via your analytics refresh step (API-key based source command/file generation).';
    }
    if (checkName === 'connection:analytics') {
        return 'Nearly done: I only need `ANALYTICSCLI_ACCESS_TOKEN` from you to continue setup. Create or copy it in dash.analyticscli.com -> API Keys, then run `analyticscli login --readonly-token <token>` and `analyticscli projects select`. Use `--api-url <url>` only for staging/local.';
    }
    if (checkName === 'connection:github') {
        return 'Verify `GITHUB_TOKEN` and repo access to `/repos/<owner>/<repo>` + issues API.';
    }
    if (checkName === 'connection:github-pull-requests') {
        return 'Verify `GITHUB_TOKEN` and repo access to `/repos/<owner>/<repo>/pulls`, plus `Pull requests: Read/Write` and `Contents: Read/Write` scopes.';
    }
    return 'Fix this blocker and rerun start.';
}
async function runPreflight(configPath, testConnections) {
    const commandParts = [
        'node',
        'scripts/openclaw-growth-preflight.mjs',
        '--config',
        quote(configPath),
    ];
    if (testConnections) {
        commandParts.push('--test-connections');
    }
    const command = commandParts.join(' ');
    const result = await runShellCommand(command, 180_000);
    const payload = parseJsonFromStdout(result.stdout);
    return {
        shell: result,
        payload,
    };
}
async function runFirstPass(configPath) {
    const command = `node scripts/openclaw-growth-runner.mjs --config ${quote(configPath)}`;
    return runShellCommand(command, 300_000);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const configPath = path.resolve(args.config);
    const configResult = await ensureConfig(configPath);
    const analyticscliEnsure = await ensureAnalyticsCliInstalled();
    if (!analyticscliEnsure.ok) {
        process.stdout.write(`${JSON.stringify({
            ok: false,
            phase: 'dependency_setup',
            configCreated: configResult.created,
            configPath,
            blockers: [
                {
                    check: 'dependency:analyticscli',
                    detail: analyticscliEnsure.detail,
                    remediation: `Install the npm package with \`npm install -g ${ANALYTICSCLI_PACKAGE_SPEC}\` or set ANALYTICSCLI_NPM_PREFIX to a writable prefix.`,
                },
            ],
        }, null, 2)}\n`);
        process.exitCode = 1;
        return;
    }
    const preflightResult = await runPreflight(configPath, args.testConnections);
    const preflightPayload = preflightResult.payload;
    if (!preflightPayload) {
        throw new Error(`Preflight returned invalid output.\nstdout:\n${preflightResult.shell.stdout}\nstderr:\n${preflightResult.shell.stderr}`);
    }
    const failures = Array.isArray(preflightPayload.checks)
        ? preflightPayload.checks.filter((check) => check.status === 'fail')
        : [];
    if (failures.length > 0) {
        const blockers = failures.map((check) => ({
            check: check.name,
            detail: check.detail,
            remediation: remediationForCheck(check.name, configPath),
        }));
        process.stdout.write(`${JSON.stringify({
            ok: false,
            phase: 'preflight',
            configCreated: configResult.created,
            configPath,
            githubRepo: configResult.githubRepo,
            blockers,
        }, null, 2)}\n`);
        process.exitCode = 1;
        return;
    }
    if (!args.run) {
        process.stdout.write(`${JSON.stringify({
            ok: true,
            phase: 'setup_complete',
            configCreated: configResult.created,
            configPath,
            message: 'Preflight passed. First run skipped due to --setup-only.',
        }, null, 2)}\n`);
        return;
    }
    const runResult = await runFirstPass(configPath);
    if (!runResult.ok) {
        process.stdout.write(`${JSON.stringify({
            ok: false,
            phase: 'first_run',
            configCreated: configResult.created,
            configPath,
            error: runResult.stderr || `exit ${runResult.code}`,
        }, null, 2)}\n`);
        process.exitCode = 1;
        return;
    }
    const actionMode = getActionMode(await readJson(configPath));
    process.stdout.write(`${JSON.stringify({
        ok: true,
        phase: 'first_run_complete',
        configCreated: configResult.created,
        configPath,
        actionMode,
        runnerOutput: runResult.stdout.trim(),
    }, null, 2)}\n`);
}
main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
