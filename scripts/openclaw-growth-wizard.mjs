#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { buildExtraSourceConfig, getDefaultSourceCommand, getDefaultSourceHint, getDefaultSourcePath, } from './openclaw-growth-shared.mjs';
const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const CONNECTOR_KEYS = ['github', 'revenuecat', 'asc'];
async function ensureDirForFile(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}
function parseArgs(argv) {
    const args = {
        config: DEFAULT_CONFIG_PATH,
        connectorWizard: false,
        connectors: '',
        out: DEFAULT_CONFIG_PATH,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        const next = argv[i + 1];
        if (token === '--') {
            continue;
        }
        else if (token === '--config') {
            args.config = next || args.config;
            args.out = next || args.out;
            i += 1;
        }
        else if (token === '--connectors' || token === '--connector-setup') {
            args.connectorWizard = true;
            if (next && !next.startsWith('-')) {
                args.connectors = next;
                i += 1;
            }
        }
        else if (token === '--out') {
            args.out = next;
            args.config = next;
            i += 1;
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
function printHelpAndExit(exitCode, reason = null) {
    if (reason) {
        process.stderr.write(`${reason}\n\n`);
    }
    process.stdout.write(`
OpenClaw Growth Setup Wizard

Usage:
  node scripts/openclaw-growth-wizard.mjs [--out <config-path>]
  node scripts/openclaw-growth-wizard.mjs --connectors [github,revenuecat,asc] [--config <config-path>]
`);
    process.exit(exitCode);
}
function quote(value) {
    if (/^[a-zA-Z0-9_./:-]+$/.test(String(value))) {
        return String(value);
    }
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
function normalizeConnectorKey(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (!normalized)
        return null;
    if (normalized === 'all')
        return 'all';
    if (['github', 'gh', 'github-code', 'codebase', 'code-access'].includes(normalized))
        return 'github';
    if (['revenuecat', 'revenue-cat', 'rc', 'revenuecat-mcp'].includes(normalized))
        return 'revenuecat';
    if (['asc', 'asc-cli', 'app-store-connect', 'appstoreconnect', 'app-store'].includes(normalized))
        return 'asc';
    return null;
}
function parseConnectorList(value) {
    const selected = new Set();
    for (const entry of String(value || '').split(',')) {
        const connector = normalizeConnectorKey(entry);
        if (!connector)
            continue;
        if (connector === 'all') {
            CONNECTOR_KEYS.forEach((key) => selected.add(key));
        }
        else {
            selected.add(connector);
        }
    }
    return [...selected];
}
async function askConnectorSelection(rl) {
    process.stdout.write('Connector setup options:\n');
    process.stdout.write('  1) GitHub code access\n');
    process.stdout.write('  2) RevenueCat monetization data\n');
    process.stdout.write('  3) App Store Connect CLI\n');
    while (true) {
        const answer = await ask(rl, 'Select connectors (comma-separated numbers/names, or all)', 'all');
        const selected = new Set();
        for (const rawEntry of answer.split(',')) {
            const entry = rawEntry.trim().toLowerCase();
            if (entry === '1')
                selected.add('github');
            if (entry === '2')
                selected.add('revenuecat');
            if (entry === '3')
                selected.add('asc');
            const key = normalizeConnectorKey(entry);
            if (key === 'all')
                CONNECTOR_KEYS.forEach((connector) => selected.add(connector));
            if (key && key !== 'all')
                selected.add(key);
        }
        if (selected.size > 0)
            return [...selected];
        process.stdout.write('Choose at least one connector.\n');
    }
}
async function commandExists(commandName) {
    const result = await runInteractiveCommand(`command -v ${quote(commandName)} >/dev/null 2>&1`, {
        silent: true,
    });
    return result === 0;
}
async function runInteractiveCommand(command, options = {}) {
    return await new Promise((resolve) => {
        const child = spawn('/bin/sh', ['-lc', command], {
            env: options.env ?? process.env,
            stdio: options.silent ? 'ignore' : 'inherit',
        });
        child.on('close', (code) => resolve(code));
    });
}
function resolveSecretsFile() {
    const explicit = process.env.OPENCLAW_GROWTH_SECRETS_FILE?.trim();
    if (explicit)
        return path.resolve(explicit);
    if (process.env.HOME)
        return path.join(process.env.HOME, '.config', 'openclaw-growth', 'secrets.env');
    return path.resolve('.openclaw-growth-secrets.env');
}
function renderEnvValue(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}
async function readSecretsFile(filePath) {
    const values = new Map();
    let raw = '';
    try {
        raw = await fs.readFile(filePath, 'utf8');
    }
    catch {
        return values;
    }
    for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)\s*$/);
        if (!match)
            continue;
        values.set(match[1], match[2].replace(/^"|"$/g, ''));
    }
    return values;
}
async function writeSecretsFile(filePath, nextValues) {
    const current = await readSecretsFile(filePath);
    for (const [key, value] of Object.entries(nextValues)) {
        if (value.trim())
            current.set(key, value.trim());
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const lines = [
        '# OpenClaw Growth local secrets.',
        '# This file is generated by openclaw-growth-wizard.mjs and should not be committed.',
        ...[...current.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `export ${key}=${renderEnvValue(value)}`),
        '',
    ];
    await fs.writeFile(filePath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(filePath, 0o600);
}
async function maybePromptSecret(rl, label, envName) {
    const existing = process.env[envName]?.trim();
    const suffix = existing ? 'already set in current environment' : 'leave empty to skip';
    const value = await ask(rl, `${label} (${suffix})`, '');
    return value.trim();
}
async function guideGitHubConnector(rl, secrets) {
    process.stdout.write('\nGitHub code access\n');
    process.stdout.write('- Preferred path: install GitHub CLI and run `gh auth login` on this host.\n');
    process.stdout.write('- Minimum read-only access: Metadata: Read and Contents: Read for the selected repository.\n');
    process.stdout.write('- Add Issues/Pull requests write scopes only if you want automated delivery.\n');
    process.stdout.write('- Token fallback URL: https://github.com/settings/personal-access-tokens/new\n');
    const hasGh = await commandExists('gh');
    if (hasGh) {
        const runLogin = await askYesNo(rl, 'Run `gh auth login` now?', true);
        if (runLogin) {
            process.stdout.write('Launching GitHub CLI login. Return here when it finishes.\n');
            rl.pause();
            await runInteractiveCommand('gh auth login');
            rl.resume();
        }
    }
    else {
        process.stdout.write('GitHub CLI is not on PATH. If this host cannot install `gh`, use the token fallback now.\n');
    }
    const storeToken = await askYesNo(rl, hasGh
        ? 'Use a fine-grained GITHUB_TOKEN fallback instead of or in addition to gh auth?'
        : 'Paste a fine-grained GITHUB_TOKEN fallback now?', !hasGh);
    if (storeToken) {
        const token = await maybePromptSecret(rl, 'Paste GITHUB_TOKEN into this local terminal', 'GITHUB_TOKEN');
        if (token)
            secrets.GITHUB_TOKEN = token;
    }
}
async function guideRevenueCatConnector(rl, secrets) {
    process.stdout.write('\nRevenueCat monetization data\n');
    const projectId = await ask(rl, 'RevenueCat project id for direct API-key URL (optional)', '');
    process.stdout.write(`Create a v2 secret API key here: ${projectId ? `https://app.revenuecat.com/projects/${projectId}/api-keys` : 'https://app.revenuecat.com/'}\n`);
    process.stdout.write('- Minimum permissions: read-only charts/metrics plus apps, products, offerings, packages, and entitlements.\n');
    process.stdout.write('- Add customer/subscriber read only only if the selected report needs it.\n');
    const apiKey = await maybePromptSecret(rl, 'Paste REVENUECAT_API_KEY into this local terminal', 'REVENUECAT_API_KEY');
    if (apiKey)
        secrets.REVENUECAT_API_KEY = apiKey;
}
async function guideAscConnector(rl, secrets) {
    process.stdout.write('\nApp Store Connect CLI\n');
    process.stdout.write('- Team API keys: https://appstoreconnect.apple.com/access/integrations/api\n');
    process.stdout.write('- Access/users: https://appstoreconnect.apple.com/access/users\n');
    process.stdout.write('- Individual account keys: https://appstoreconnect.apple.com/account\n');
    process.stdout.write('- Use the least role that can read the required reports. Avoid Admin unless temporarily required.\n');
    process.stdout.write('- Save the downloaded .p8 on this host and paste only its file path here.\n');
    const keyId = await ask(rl, 'ASC_KEY_ID (leave empty to skip)', process.env.ASC_KEY_ID || '');
    const issuerId = await ask(rl, 'ASC_ISSUER_ID (leave empty to skip)', process.env.ASC_ISSUER_ID || '');
    const privateKeyPath = await ask(rl, 'ASC_PRIVATE_KEY_PATH (path to AuthKey_XXXX.p8, leave empty to skip)', process.env.ASC_PRIVATE_KEY_PATH || '');
    if (keyId.trim())
        secrets.ASC_KEY_ID = keyId.trim();
    if (issuerId.trim())
        secrets.ASC_ISSUER_ID = issuerId.trim();
    if (privateKeyPath.trim())
        secrets.ASC_PRIVATE_KEY_PATH = privateKeyPath.trim();
}
async function runConnectorSetupWizard(args) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Connector wizard requires an interactive terminal.');
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const selected = args.connectors ? parseConnectorList(args.connectors) : await askConnectorSelection(rl);
        if (selected.length === 0) {
            throw new Error('No supported connectors selected. Use github, revenuecat, asc, or all.');
        }
        process.stdout.write('OpenClaw connector setup wizard\n');
        process.stdout.write('Secrets entered here stay on this host. Do not paste them into Discord/OpenClaw chat.\n');
        process.stdout.write(`Selected connectors: ${selected.join(', ')}\n`);
        const secrets = {};
        if (selected.includes('github'))
            await guideGitHubConnector(rl, secrets);
        if (selected.includes('revenuecat'))
            await guideRevenueCatConnector(rl, secrets);
        if (selected.includes('asc'))
            await guideAscConnector(rl, secrets);
        const secretsFile = resolveSecretsFile();
        const wroteSecrets = Object.keys(secrets).length > 0;
        if (wroteSecrets) {
            await writeSecretsFile(secretsFile, secrets);
            process.stdout.write(`\nSaved local secrets to ${secretsFile} with chmod 600.\n`);
        }
        else {
            process.stdout.write('\nNo new secrets were written.\n');
        }
        const runSetup = await askYesNo(rl, 'Run helper installation/config enablement now?', true);
        if (runSetup) {
            const env = {
                ...process.env,
                ...secrets,
            };
            const command = `node scripts/openclaw-growth-start.mjs --config ${quote(args.config)} --setup-only --connectors ${quote(selected.join(','))}`;
            process.stdout.write(`\nRunning: ${command}\n`);
            await runInteractiveCommand(command, { env });
        }
        if (wroteSecrets) {
            process.stdout.write('\nFor future shell runs, load secrets first:\n');
            process.stdout.write(`  set -a; . ${quote(secretsFile)}; set +a\n`);
            process.stdout.write(`Then rerun setup or a smoke test:\n`);
            process.stdout.write(`  node scripts/openclaw-growth-start.mjs --config ${quote(args.config)} --setup-only --connectors ${quote(selected.join(','))}\n`);
        }
        else {
            process.stdout.write('\nRerun this wizard when you are ready to add connector secrets or run helper setup.\n');
        }
    }
    finally {
        rl.close();
    }
}
async function ask(rl, label, defaultValue = '') {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    return answer || defaultValue;
}
async function askYesNo(rl, label, defaultYes = true) {
    const suffix = defaultYes ? '[Y/n]' : '[y/N]';
    while (true) {
        const answer = (await rl.question(`${label} ${suffix} `)).trim().toLowerCase();
        if (!answer)
            return defaultYes;
        if (answer === 'y' || answer === 'yes')
            return true;
        if (answer === 'n' || answer === 'no')
            return false;
    }
}
async function askChoice(rl, label, options, defaultValue) {
    const normalizedDefault = options.includes(defaultValue) ? defaultValue : options[0];
    while (true) {
        const answer = (await rl.question(`${label} (${options.join('/')}) [${normalizedDefault}]: `))
            .trim()
            .toLowerCase();
        if (!answer) {
            return normalizedDefault;
        }
        if (options.includes(answer)) {
            return answer;
        }
    }
}
async function askSourceConfig(rl, sourceName, defaultPath, hint, options = {}) {
    const forceEnabled = Boolean(options.forceEnabled);
    const defaultCommand = String(options.defaultCommand || '').trim();
    const defaultMode = defaultCommand ? 'command' : 'file';
    const defaultEnabled = options.defaultEnabled ?? sourceName === 'analytics';
    const enabled = forceEnabled
        ? true
        : await askYesNo(rl, `Enable source "${sourceName}"?`, defaultEnabled);
    if (!enabled) {
        return {
            enabled: false,
            mode: 'file',
            path: defaultPath,
            hint,
        };
    }
    process.stdout.write(`Where to get ${sourceName} data:\n${hint}\n`);
    const modeInput = await ask(rl, 'Mode (file/command)', defaultMode);
    const mode = modeInput.toLowerCase() === 'command' ? 'command' : 'file';
    const value = await ask(rl, mode === 'file' ? `${sourceName} JSON file path` : `${sourceName} command`, mode === 'file' ? defaultPath : defaultCommand);
    if (mode === 'file') {
        return {
            enabled: true,
            mode,
            path: value,
            hint,
        };
    }
    return {
        enabled: true,
        mode,
        command: value,
        hint,
        ...(options.cursorMode ? { cursorMode: options.cursorMode } : {}),
        ...(options.initialLookback ? { initialLookback: options.initialLookback } : {}),
    };
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.connectorWizard) {
        await runConnectorSetupWizard(args);
        return;
    }
    const configPath = path.resolve(args.out);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Wizard requires an interactive terminal.');
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        process.stdout.write('OpenClaw Growth Engineer - Setup Wizard\n');
        process.stdout.write('This wizard writes non-secret config only.\n\n');
        let githubRepo = '';
        while (!githubRepo) {
            githubRepo = await ask(rl, 'GitHub repo (owner/name, required)', '');
            if (!githubRepo) {
                process.stdout.write('GitHub repo is required for this workflow.\n');
            }
        }
        const labelsRaw = await ask(rl, 'Issue labels (comma-separated)', 'ai-growth,autogenerated,product');
        const labels = labelsRaw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const maxIssues = Number.parseInt(await ask(rl, 'Max issues per run', '4'), 10) || 4;
        const intervalMinutes = Number.parseInt(await ask(rl, 'Check interval in minutes', '1440'), 10) || 1440;
        const actionMode = await askChoice(rl, 'Preferred GitHub output', ['issue', 'pull_request'], 'issue');
        const analytics = await askSourceConfig(rl, 'analytics', 'data/openclaw-growth-engineer/analytics_summary.example.json', getDefaultSourceHint('analytics'), {
            forceEnabled: true,
            defaultCommand: getDefaultSourceCommand('analytics'),
        });
        const revenuecat = await askSourceConfig(rl, 'revenuecat', 'data/openclaw-growth-engineer/revenuecat_summary.example.json', getDefaultSourceHint('revenuecat'));
        const sentry = await askSourceConfig(rl, 'sentry', 'data/openclaw-growth-engineer/sentry_summary.example.json', getDefaultSourceHint('sentry'));
        const feedback = await askSourceConfig(rl, 'feedback', 'data/openclaw-growth-engineer/feedback_summary.example.json', getDefaultSourceHint('feedback'), {
            defaultEnabled: true,
            defaultCommand: getDefaultSourceCommand('feedback'),
            cursorMode: 'auto_since_last_fetch',
            initialLookback: '30d',
        });
        const extraSourcesRaw = await ask(rl, 'Extra connectors (comma-separated, e.g. glitchtip,asc-cli,app-store-reviews)', '');
        const extraSources = extraSourcesRaw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((service) => {
            const defaultCommand = getDefaultSourceCommand(service);
            return buildExtraSourceConfig(service, defaultCommand ? {} : { mode: 'file', path: getDefaultSourcePath(service) });
        });
        const autoCreateIssues = actionMode === 'issue'
            ? await askYesNo(rl, 'Create GitHub issues automatically when new ideas are found?', false)
            : false;
        const autoCreatePullRequests = actionMode === 'pull_request'
            ? await askYesNo(rl, 'Create draft pull requests with implementation proposal files automatically?', false)
            : false;
        const enableCharting = await askYesNo(rl, 'Generate matplotlib charts from analytics signals and include them in generated GitHub artifacts?', false);
        const chartCommand = enableCharting
            ? await ask(rl, 'Optional chart command override (leave empty for default python script)', '')
            : '';
        const config = {
            version: 1,
            generatedAt: new Date().toISOString(),
            project: {
                githubRepo,
                repoRoot: '.',
                outFile: 'data/openclaw-growth-engineer/issues.generated.json',
                maxIssues,
                titlePrefix: '[Growth]',
                labels,
            },
            sources: {
                analytics,
                revenuecat,
                sentry,
                feedback,
                extra: extraSources,
            },
            schedule: {
                intervalMinutes,
                skipIfNoDataChange: true,
                skipIfIssueSetUnchanged: true,
            },
            actions: {
                autoCreateIssues,
                autoCreatePullRequests,
                mode: actionMode,
                draftPullRequests: true,
                proposalBranchPrefix: 'openclaw/proposals',
            },
            charting: {
                enabled: enableCharting,
                command: chartCommand || null,
            },
            secrets: {
                githubTokenEnv: 'GITHUB_TOKEN',
                analyticsTokenEnv: 'ANALYTICSCLI_ACCESS_TOKEN',
                revenuecatTokenEnv: 'REVENUECAT_API_KEY',
                sentryTokenEnv: 'SENTRY_AUTH_TOKEN',
            },
        };
        await ensureDirForFile(configPath);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
        process.stdout.write(`\nSaved config: ${configPath}\n`);
        process.stdout.write('\nNext steps:\n');
        process.stdout.write(`1) Set secrets in OpenClaw secret store (env var names in config.secrets)\n`);
        if (extraSources.length > 0) {
            process.stdout.write(`2) Fill each extra connector under \`sources.extra[]\` with the final file path or command and optional \`secretEnv\`\n`);
            process.stdout.write(`3) Run once: node scripts/openclaw-growth-runner.mjs --config ${configPath}\n`);
            process.stdout.write(`4) Run interval loop: node scripts/openclaw-growth-runner.mjs --config ${configPath} --loop\n`);
            return;
        }
        process.stdout.write(`2) Run once: node scripts/openclaw-growth-runner.mjs --config ${configPath}\n`);
        process.stdout.write(`3) Run interval loop: node scripts/openclaw-growth-runner.mjs --config ${configPath} --loop\n`);
    }
    finally {
        rl.close();
    }
}
main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
