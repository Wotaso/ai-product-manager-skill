#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { buildExtraSourceConfig, getDefaultSourceCommand, getDefaultSourceHint, getDefaultSourcePath, } from './openclaw-growth-shared.mjs';
const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const CONNECTOR_KEYS = ['github', 'revenuecat', 'asc'];
const CONNECTOR_DEFINITIONS = [
    {
        key: 'github',
        label: 'GitHub code access',
        summary: 'Read repo context and optionally create issues or draft PRs.',
        needs: 'Choose read-only or read/write access; you can change it later by rerunning the wizard.',
    },
    {
        key: 'revenuecat',
        label: 'RevenueCat monetization data',
        summary: 'Read subscription, product, entitlement, and revenue context.',
        needs: 'A RevenueCat v2 secret API key with read-only project permissions.',
    },
    {
        key: 'asc',
        label: 'App Store Connect CLI',
        summary: 'Read app, build, review, rating, TestFlight, and store metadata signals.',
        needs: 'ASC_KEY_ID, ASC_ISSUER_ID, and an AuthKey_XXXX.p8 path on this host.',
    },
];
const ANSI = {
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    hideCursor: '\x1b[?25l',
    reset: '\x1b[0m',
    showCursor: '\x1b[?25h',
};
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
    if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
        return await askConnectorSelectionByText(rl);
    }
    rl.pause();
    try {
        return await askConnectorSelectionByKeys();
    }
    finally {
        rl.resume();
    }
}
async function askConnectorSelectionByText(rl) {
    printConnectorIntro();
    CONNECTOR_DEFINITIONS.forEach((connector, index) => {
        process.stdout.write(`  ${index + 1}) ${connector.label}\n`);
        process.stdout.write(`     ${connector.summary}\n`);
    });
    while (true) {
        const answer = await ask(rl, 'Select connectors (comma-separated numbers/names, or all)', 'all');
        const selected = parseConnectorAnswer(answer);
        if (selected.length > 0)
            return selected;
        process.stdout.write('\nChoose at least one connector.\n\n');
    }
}
function parseConnectorAnswer(answer) {
    const selected = new Set();
    for (const rawEntry of String(answer || '').split(',')) {
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
    return orderConnectors([...selected]);
}
function orderConnectors(keys) {
    const selected = new Set(keys);
    return CONNECTOR_KEYS.filter((key) => selected.has(key));
}
function printConnectorIntro() {
    process.stdout.write(`\n${ANSI.bold}OpenClaw connector setup${ANSI.reset}\n`);
    process.stdout.write(`${ANSI.dim}Secrets stay local on this host. Do not paste them into Discord/OpenClaw chat.${ANSI.reset}\n\n`);
}
function connectorLabel(key) {
    return CONNECTOR_DEFINITIONS.find((connector) => connector.key === key)?.label ?? key;
}
function renderConnectorPicker(cursorIndex, selected, warning = '') {
    process.stdout.write('\x1b[2J\x1b[H');
    printConnectorIntro();
    process.stdout.write(`${ANSI.bold}Select connectors${ANSI.reset}\n`);
    process.stdout.write(`${ANSI.dim}Use Up/Down to move, Space to toggle, A to toggle all, Enter to continue.${ANSI.reset}\n\n`);
    CONNECTOR_DEFINITIONS.forEach((connector, index) => {
        const active = index === cursorIndex;
        const checked = selected.has(connector.key);
        const pointer = active ? `${ANSI.cyan}>${ANSI.reset}` : ' ';
        const box = checked ? `${ANSI.green}[x]${ANSI.reset}` : '[ ]';
        const title = active ? `${ANSI.bold}${connector.label}${ANSI.reset}` : connector.label;
        process.stdout.write(`${pointer} ${box} ${title}\n`);
        process.stdout.write(`    ${connector.summary}\n`);
        process.stdout.write(`    ${ANSI.dim}Needs: ${connector.needs}${ANSI.reset}\n\n`);
    });
    if (warning) {
        process.stdout.write(`${ANSI.bold}${warning}${ANSI.reset}\n\n`);
    }
    process.stdout.write(`${ANSI.dim}Esc/Q cancels. Number keys 1-${CONNECTOR_DEFINITIONS.length} also toggle connectors.${ANSI.reset}\n`);
}
async function askConnectorSelectionByKeys() {
    emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let cursorIndex = 0;
    const selected = new Set(CONNECTOR_KEYS);
    let warning = '';
    return await new Promise((resolve, reject) => {
        const cleanup = () => {
            process.stdin.off('keypress', onKeypress);
            process.stdin.setRawMode(Boolean(wasRaw));
            process.stdout.write(ANSI.showCursor);
        };
        const finish = () => {
            if (selected.size === 0) {
                warning = 'Choose at least one connector before continuing.';
                renderConnectorPicker(cursorIndex, selected, warning);
                return;
            }
            cleanup();
            process.stdout.write('\x1b[2J\x1b[H');
            resolve(orderConnectors([...selected]));
        };
        const cancel = () => {
            cleanup();
            process.stdout.write('\n');
            reject(new Error('Connector setup cancelled.'));
        };
        const toggleCurrent = () => {
            const key = CONNECTOR_DEFINITIONS[cursorIndex].key;
            if (selected.has(key))
                selected.delete(key);
            else
                selected.add(key);
            warning = '';
        };
        const toggleAll = () => {
            if (selected.size === CONNECTOR_KEYS.length)
                selected.clear();
            else
                CONNECTOR_KEYS.forEach((key) => selected.add(key));
            warning = '';
        };
        const onKeypress = (_text, key) => {
            if (key?.ctrl && key?.name === 'c') {
                cancel();
                return;
            }
            if (key?.name === 'escape' || key?.name === 'q') {
                cancel();
                return;
            }
            if (key?.name === 'up' || key?.name === 'k') {
                cursorIndex = (cursorIndex - 1 + CONNECTOR_DEFINITIONS.length) % CONNECTOR_DEFINITIONS.length;
                warning = '';
            }
            else if (key?.name === 'down' || key?.name === 'j') {
                cursorIndex = (cursorIndex + 1) % CONNECTOR_DEFINITIONS.length;
                warning = '';
            }
            else if (key?.name === 'space') {
                toggleCurrent();
            }
            else if (key?.name === 'a') {
                toggleAll();
            }
            else if (key?.name === 'return' || key?.name === 'enter') {
                finish();
                return;
            }
            else if (/^[1-9]$/.test(String(_text || ''))) {
                const index = Number(_text) - 1;
                const connector = CONNECTOR_DEFINITIONS[index];
                if (connector) {
                    if (selected.has(connector.key))
                        selected.delete(connector.key);
                    else
                        selected.add(connector.key);
                    cursorIndex = index;
                    warning = '';
                }
            }
            renderConnectorPicker(cursorIndex, selected, warning);
        };
        process.stdin.on('keypress', onKeypress);
        process.stdout.write(ANSI.hideCursor);
        renderConnectorPicker(cursorIndex, selected, warning);
    });
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
function getUserLocalBinDir() {
    return process.env.HOME ? path.join(process.env.HOME, '.local', 'bin') : null;
}
function prependPath(dir) {
    const current = process.env.PATH || '';
    if (!current.split(':').includes(dir)) {
        process.env.PATH = `${dir}:${current}`;
    }
}
function getGitHubCliReleaseAssetName(version) {
    const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : '';
    if (process.platform === 'linux' && arch) {
        return `gh_${version}_linux_${arch}.tar.gz`;
    }
    return null;
}
async function resolveGitHubCliReleaseAssetUrl() {
    const response = await fetch('https://api.github.com/repos/cli/cli/releases/latest', {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'openclaw-growth-wizard',
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub CLI release lookup failed (${response.status})`);
    }
    const release = await response.json();
    const version = String(release.tag_name || '').replace(/^v/, '');
    const assetName = getGitHubCliReleaseAssetName(version);
    if (!assetName) {
        throw new Error(`No user-local gh installer is defined for ${process.platform}/${process.arch}`);
    }
    const asset = release.assets?.find((entry) => entry.name === assetName);
    if (!asset?.browser_download_url) {
        throw new Error(`GitHub CLI release asset not found: ${assetName}`);
    }
    return asset.browser_download_url;
}
async function installGitHubCliUserLocal() {
    const binDir = getUserLocalBinDir();
    if (!binDir) {
        process.stdout.write('Cannot install gh automatically because HOME is not set.\n');
        return false;
    }
    if (!(await commandExists('curl'))) {
        process.stdout.write('Cannot install gh automatically because curl is not available.\n');
        return false;
    }
    if (!(await commandExists('tar'))) {
        process.stdout.write('Cannot install gh automatically because tar is not available.\n');
        return false;
    }
    try {
        const url = await resolveGitHubCliReleaseAssetUrl();
        const cacheDir = process.env.HOME
            ? path.join(process.env.HOME, '.cache', 'openclaw-gh')
            : path.join(process.cwd(), '.openclaw-gh-cache');
        const command = [
            'set -eu',
            `mkdir -p ${quote(binDir)} ${quote(cacheDir)}`,
            `tmp="$(mktemp -d ${quote(path.join(cacheDir, 'gh.XXXXXX'))})"`,
            'trap \'rm -rf "$tmp"\' EXIT',
            `curl -fsSL ${quote(url)} -o "$tmp/gh.tar.gz"`,
            'tar -xzf "$tmp/gh.tar.gz" -C "$tmp"',
            'gh_bin="$(find "$tmp" -path "*/bin/gh" -type f | head -n 1)"',
            'test -n "$gh_bin"',
            `cp "$gh_bin" ${quote(path.join(binDir, 'gh'))}`,
            `chmod 755 ${quote(path.join(binDir, 'gh'))}`,
            'for profile in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.zshrc" "$HOME/.zprofile"; do touch "$profile"; grep -Fq \'export PATH="$HOME/.local/bin:$PATH"\' "$profile" || printf \'\\n# OpenClaw user-local bin\\nexport PATH="$HOME/.local/bin:$PATH"\\n\' >> "$profile"; done',
        ].join(' && ');
        process.stdout.write(`Installing GitHub CLI locally into ${binDir}/gh...\n`);
        const code = await runInteractiveCommand(command);
        prependPath(binDir);
        return code === 0 && await commandExists('gh');
    }
    catch (error) {
        process.stdout.write(`Automatic gh install failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return false;
    }
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
function printSection(title, lines = []) {
    process.stdout.write(`\n${ANSI.bold}${title}${ANSI.reset}\n`);
    process.stdout.write(`${'-'.repeat(title.length)}\n`);
    for (const line of lines) {
        process.stdout.write(`${line}\n`);
    }
    if (lines.length > 0)
        process.stdout.write('\n');
}
function printBullets(lines) {
    for (const line of lines) {
        process.stdout.write(`  - ${line}\n`);
    }
    process.stdout.write('\n');
}
async function guideGitHubConnector(rl, secrets) {
    printSection('GitHub code access', [
        'Use this when OpenClaw should read repo context or create GitHub delivery artifacts.',
    ]);
    printBullets([
        'Choose the permission level you want for this host.',
        'Read-only is enough for code context and product analysis.',
        'Read/write is only needed if OpenClaw should create issues, branches, or draft PRs.',
        'You can rerun this wizard later to change GitHub permissions.',
    ]);
    const accessMode = await askChoice(rl, 'GitHub permission mode', ['read-only', 'read-write'], 'read-only');
    let hasGh = await commandExists('gh');
    if (!hasGh) {
        hasGh = await installGitHubCliUserLocal();
    }
    if (hasGh) {
        process.stdout.write('GitHub CLI is available for helper commands.\n\n');
    }
    if (accessMode === 'read-only') {
        printBullets([
            'Create a fine-grained GitHub token for only the repositories OpenClaw should read.',
            'Required permissions: Metadata: Read, Contents: Read.',
            'Do not grant Issues, Pull requests, Contents write, Workflow, or full repository control for read-only mode.',
        ]);
    }
    else {
        printBullets([
            'Create a fine-grained GitHub token for only the repositories OpenClaw should modify.',
            'Base permissions: Metadata: Read and Contents: Read.',
            'Add Issues: Read/Write only if OpenClaw should create backlog issues.',
            'Add Pull requests: Read/Write and Contents: Read/Write only if OpenClaw should create draft PR branches.',
            'Add Workflow only if you explicitly want OpenClaw to edit GitHub Actions workflow files.',
        ]);
    }
    process.stdout.write('Token URL: https://github.com/settings/personal-access-tokens/new\n\n');
    const token = await maybePromptSecret(rl, `Paste GITHUB_TOKEN for ${accessMode} access into this local terminal`, 'GITHUB_TOKEN');
    if (token)
        secrets.GITHUB_TOKEN = token;
    else
        process.stdout.write('No GitHub token saved. GitHub setup remains pending; rerun this wizard when ready.\n\n');
}
async function guideRevenueCatConnector(rl, secrets) {
    printSection('RevenueCat monetization data', [
        'Use this when OpenClaw should read subscription, product, entitlement, and revenue context.',
    ]);
    const projectId = await ask(rl, 'RevenueCat project id for direct API-key URL (optional)', '');
    process.stdout.write(`\nCreate a v2 secret API key here:\n  ${projectId ? `https://app.revenuecat.com/projects/${projectId}/api-keys` : 'https://app.revenuecat.com/'}\n`);
    printBullets([
        'Minimum permissions: read-only charts/metrics plus apps, products, offerings, packages, and entitlements.',
        'Add customer/subscriber read only only if the selected report needs it.',
        'Paste the key only into this terminal when prompted.',
    ]);
    const apiKey = await maybePromptSecret(rl, 'Paste REVENUECAT_API_KEY into this local terminal', 'REVENUECAT_API_KEY');
    if (apiKey)
        secrets.REVENUECAT_API_KEY = apiKey;
}
async function guideAscConnector(rl, secrets) {
    printSection('App Store Connect CLI', [
        'Use this when OpenClaw should read app, build, TestFlight, review, rating, and store signals.',
    ]);
    process.stdout.write('Create an API key from one of these pages:\n');
    printBullets([
        'Team API keys: https://appstoreconnect.apple.com/access/integrations/api',
        'Access/users: https://appstoreconnect.apple.com/access/users',
        'Individual account keys: https://appstoreconnect.apple.com/account',
    ]);
    printBullets([
        'Use the least role that can read the required reports. Avoid Admin unless temporarily required.',
        'Save the downloaded .p8 on this host with chmod 600.',
        'Paste only the .p8 file path into this terminal.',
    ]);
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
        printConnectorIntro();
        process.stdout.write(`${ANSI.bold}Selected connectors${ANSI.reset}\n`);
        for (const key of selected) {
            process.stdout.write(`  - ${connectorLabel(key)}\n`);
        }
        process.stdout.write('\n');
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
