#!/usr/bin/env node
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getActionMode, getAllSourceEntries, getGitHubRequirementText, shouldAutoCreateGitHubArtifact, } from './openclaw-growth-shared.mjs';
import { loadOpenClawGrowthSecrets } from './openclaw-growth-env.mjs';
const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const DEFAULT_STATE_PATH = 'data/openclaw-growth-engineer/state.json';
const DEFAULT_RUNTIME_DIR = 'data/openclaw-growth-engineer/runtime';
function parseArgs(argv) {
    const args = {
        config: DEFAULT_CONFIG_PATH,
        state: DEFAULT_STATE_PATH,
        loop: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        const next = argv[i + 1];
        if (token === '--') {
            continue;
        }
        else if (token === '--config') {
            args.config = next;
            i += 1;
        }
        else if (token === '--state') {
            args.state = next;
            i += 1;
        }
        else if (token === '--loop') {
            args.loop = true;
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
OpenClaw Growth Runner

Usage:
  node scripts/openclaw-growth-runner.mjs [--config <file>] [--state <file>] [--loop]

Default config: ${DEFAULT_CONFIG_PATH}
Default state:  ${DEFAULT_STATE_PATH}
`);
    process.exit(exitCode);
}
async function readJson(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
}
async function readJsonOptional(filePath, fallback) {
    try {
        return await readJson(filePath);
    }
    catch {
        return fallback;
    }
}
async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
function sha256(input) {
    return createHash('sha256').update(input).digest('hex');
}
function stableStringify(value) {
    return JSON.stringify(value, Object.keys(value).sort(), 2);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function commandExists(commandName) {
    const result = await runShellCommand(`command -v ${quote(commandName)} >/dev/null 2>&1`, 10_000);
    return result.ok;
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
function resolveAnalyticsSkillCandidates(config) {
    const repoRoot = path.resolve(String(config?.project?.repoRoot || '.'));
    const home = os.homedir();
    return [
        path.join(repoRoot, 'skills/analyticscli-cli/SKILL.md'),
        path.join(repoRoot, 'agent/skills/analyticscli-cli-skill.md'),
        path.join(process.cwd(), 'skills/analyticscli-cli/SKILL.md'),
        path.join(process.cwd(), 'agent/skills/analyticscli-cli-skill.md'),
        path.join(home, '.openclaw/skills/analyticscli-cli/SKILL.md'),
        path.join(home, '.codex/skills/analyticscli-cli/SKILL.md'),
    ];
}
async function findAnalyticsSkillPath(config) {
    const candidates = resolveAnalyticsSkillCandidates(config);
    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return { path: candidate, checked: candidates };
        }
    }
    return { path: null, checked: candidates };
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
function runShellCommand(command, timeoutMs = 120_000, options = {}) {
    return new Promise((resolve) => {
        const child = spawn(resolveShellCommand(), ['-c', command], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: options.cwd,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGTERM');
            resolve({ ok: false, code: null, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms` });
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
function getSecretName(config, key, fallback) {
    const value = config?.secrets?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
async function assertHardRequirements(config) {
    const missing = [];
    const analyticsSource = config?.sources?.analytics;
    const actionMode = getActionMode(config);
    const requiresGitHubDelivery = shouldAutoCreateGitHubArtifact(config);
    if (!analyticsSource || analyticsSource.enabled === false) {
        missing.push('sources.analytics must be enabled');
    }
    const analyticscliExists = await commandExists('analyticscli');
    if (!analyticscliExists) {
        missing.push('analyticscli binary is required');
    }
    if (requiresGitHubDelivery) {
        const githubRepo = String(config?.project?.githubRepo || '').trim();
        if (!githubRepo) {
            missing.push('project.githubRepo is required when GitHub auto-create is enabled');
        }
        const githubTokenEnv = getSecretName(config, 'githubTokenEnv', 'GITHUB_TOKEN');
        if (!process.env[githubTokenEnv]) {
            missing.push(`${githubTokenEnv} env var is required (${getGitHubRequirementText(actionMode)})`);
        }
    }
    if (missing.length > 0) {
        const message = `Hard requirements missing:\n- ${missing.join('\n- ')}`;
        throw new Error(message);
    }
}
function getProjectCommandCwd(config) {
    const repoRoot = String(config?.project?.repoRoot || '').trim();
    return repoRoot ? path.resolve(repoRoot) : process.cwd();
}
async function resolveSourcePayload(sourceConfig, sourceName, commandCwd = process.cwd()) {
    if (!sourceConfig || sourceConfig.enabled === false) {
        return null;
    }
    if (sourceConfig.mode === 'command') {
        if (!sourceConfig.command) {
            throw new Error(`Source "${sourceName}" has mode=command but no command configured.`);
        }
        const result = await runShellCommand(String(sourceConfig.command), 120_000, { cwd: commandCwd });
        if (!result.ok) {
            throw new Error(`Source "${sourceName}" command failed: ${result.stderr || `exit ${result.code}`}`);
        }
        try {
            return JSON.parse(result.stdout);
        }
        catch (error) {
            throw new Error(`Source "${sourceName}" returned non-JSON output.`);
        }
    }
    if (!sourceConfig.path) {
        throw new Error(`Source "${sourceName}" has mode=file but no path configured.`);
    }
    const payload = await readJson(path.resolve(String(sourceConfig.path)));
    return payload;
}
function buildIssueFingerprint(issuesPayload) {
    const titles = Array.isArray(issuesPayload?.issues)
        ? issuesPayload.issues.map((issue) => `${issue.title}|${issue.priority}|${issue.area}`).sort()
        : [];
    return sha256(titles.join('\n'));
}
async function runAnalyzer({ config, runtimeDir, sourceFiles, createGitHubArtifact, chartManifestPath, }) {
    await ensureDir(runtimeDir);
    if (!sourceFiles.analytics) {
        throw new Error('Analytics source is required (enable and configure `sources.analytics`).');
    }
    const outFile = path.resolve(config.project?.outFile || 'data/openclaw-growth-engineer/issues.generated.json');
    const args = [
        'scripts/openclaw-growth-engineer.mjs',
        '--analytics',
        sourceFiles.analytics,
        '--repo-root',
        path.resolve(config.project?.repoRoot || '.'),
        '--out',
        outFile,
        '--max-issues',
        String(config.project?.maxIssues || 4),
        '--title-prefix',
        String(config.project?.titlePrefix || '[Growth]'),
    ];
    if (sourceFiles.revenuecat) {
        args.push('--revenuecat', sourceFiles.revenuecat);
    }
    if (sourceFiles.sentry) {
        args.push('--sentry', sourceFiles.sentry);
    }
    if (sourceFiles.feedback) {
        args.push('--feedback', sourceFiles.feedback);
    }
    for (const source of getAllSourceEntries(config).filter((entry) => !entry.builtIn)) {
        if (sourceFiles[source.key]) {
            args.push('--source', `${source.key}=${sourceFiles[source.key]}`);
        }
    }
    if (createGitHubArtifact) {
        const repo = String(config.project?.githubRepo || '').trim();
        if (!repo) {
            throw new Error(`actions.mode=${getActionMode(config)} requires project.githubRepo.`);
        }
        args.push(getActionMode(config) === 'pull_request' ? '--create-pull-requests' : '--create-issues', '--repo', repo);
        const labels = Array.isArray(config.project?.labels) ? config.project.labels : [];
        if (labels.length > 0) {
            args.push('--labels', labels.join(','));
        }
        if (config.actions?.proposalBranchPrefix) {
            args.push('--branch-prefix', String(config.actions.proposalBranchPrefix));
        }
        if (config.actions?.draftPullRequests === false) {
            args.push('--no-draft-pull-requests');
        }
    }
    if (chartManifestPath) {
        args.push('--chart-manifest', chartManifestPath);
    }
    const analyzer = await runShellCommand(`node ${args.map(quote).join(' ')}`);
    if (!analyzer.ok) {
        throw new Error(`Analyzer failed: ${analyzer.stderr || `exit ${analyzer.code}`}`);
    }
    const issuesPayload = await readJson(outFile);
    return {
        outFile,
        sourceFiles,
        issuesPayload,
        analyzerStdout: analyzer.stdout.trim(),
    };
}
async function maybeGenerateCharts({ config, payloads, runtimeDir }) {
    if (!config.charting?.enabled) {
        return null;
    }
    const analyticsPayload = payloads.analytics;
    if (!analyticsPayload) {
        return null;
    }
    await ensureDir(runtimeDir);
    const chartsDir = path.join(runtimeDir, 'charts');
    await ensureDir(chartsDir);
    const analyticsForChartsPath = path.join(runtimeDir, 'analytics_for_charts.json');
    const manifestPath = path.join(chartsDir, 'manifest.json');
    await fs.writeFile(analyticsForChartsPath, JSON.stringify(analyticsPayload, null, 2), 'utf8');
    const defaultCommand = [
        'python3',
        'scripts/openclaw-growth-charts.py',
        '--analytics',
        analyticsForChartsPath,
        '--out-dir',
        chartsDir,
        '--manifest',
        manifestPath,
    ]
        .map(quote)
        .join(' ');
    const command = String(config.charting?.command || defaultCommand);
    const result = await runShellCommand(command);
    if (!result.ok) {
        process.stderr.write(`[${new Date().toISOString()}] Chart generation failed: ${result.stderr || `exit ${result.code}`}\n`);
        return null;
    }
    return manifestPath;
}
function quote(value) {
    if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
        return value;
    }
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
function computeSourceHashes(sourcePayloadMap) {
    const hashes = {};
    for (const [key, value] of Object.entries(sourcePayloadMap)) {
        hashes[key] = sha256(stableStringify(value));
    }
    return hashes;
}
function normalizeLookback(value, fallback = '30d') {
    const normalized = String(value || fallback).trim();
    return /^[0-9]+[dhm]$/.test(normalized) ? normalized : fallback;
}
function commandHasExplicitTimeBounds(command) {
    return /(^|\s)--(?:since|until|last)\b/.test(String(command));
}
function resolveCursorAwareCommand(command, sourceConfig, cursorState) {
    const rawCommand = String(command || '').trim();
    if (!rawCommand) {
        return rawCommand;
    }
    if (sourceConfig?.cursorMode !== 'auto_since_last_fetch') {
        return rawCommand;
    }
    if (commandHasExplicitTimeBounds(rawCommand)) {
        return rawCommand;
    }
    const lastCollectedAt = String(cursorState?.lastCollectedAt || '').trim();
    if (lastCollectedAt) {
        return `${rawCommand} --since ${quote(lastCollectedAt)}`;
    }
    const lookback = normalizeLookback(sourceConfig?.initialLookback, '30d');
    return `${rawCommand} --last ${quote(lookback)}`;
}
async function resolveSourcePayloadWithCursor(sourceConfig, sourceName, cursorState, commandCwd = process.cwd()) {
    if (!sourceConfig || sourceConfig.enabled === false) {
        return {
            payload: null,
            nextCursor: cursorState || null,
            resolvedCommand: null,
        };
    }
    if (sourceConfig.mode === 'command') {
        if (!sourceConfig.command) {
            throw new Error(`Source "${sourceName}" has mode=command but no command configured.`);
        }
        const resolvedCommand = resolveCursorAwareCommand(sourceConfig.command, sourceConfig, cursorState);
        const result = await runShellCommand(String(resolvedCommand), 120_000, { cwd: commandCwd });
        if (!result.ok) {
            throw new Error(`Source "${sourceName}" command failed: ${result.stderr || `exit ${result.code}`}`);
        }
        const fetchedAt = new Date().toISOString();
        try {
            return {
                payload: JSON.parse(result.stdout),
                nextCursor: sourceConfig.cursorMode === 'auto_since_last_fetch'
                    ? {
                        lastCollectedAt: fetchedAt,
                        updatedAt: fetchedAt,
                        lastCommand: resolvedCommand,
                    }
                    : cursorState || null,
                resolvedCommand,
            };
        }
        catch (error) {
            throw new Error(`Source "${sourceName}" returned non-JSON output.`);
        }
    }
    if (!sourceConfig.path) {
        throw new Error(`Source "${sourceName}" has mode=file but no path configured.`);
    }
    return {
        payload: await readJson(path.resolve(String(sourceConfig.path))),
        nextCursor: cursorState || null,
        resolvedCommand: null,
    };
}
async function loadSourcePayloads(config, state) {
    const payloads = {};
    const sourceCursors = { ...(state?.sourceCursors || {}) };
    const commandCwd = getProjectCommandCwd(config);
    for (const source of getAllSourceEntries(config)) {
        const currentCursor = sourceCursors[source.key] || null;
        const result = await resolveSourcePayloadWithCursor(source, source.key, currentCursor, commandCwd);
        const payload = result.payload;
        if (payload) {
            payloads[source.key] = payload;
        }
        if (result.nextCursor) {
            sourceCursors[source.key] = result.nextCursor;
        }
    }
    return {
        payloads,
        sourceCursors,
    };
}
async function materializeSourceFiles(config, payloads, runtimeDir) {
    await ensureDir(runtimeDir);
    const sourceFiles = {};
    for (const source of getAllSourceEntries(config)) {
        const payload = payloads[source.key];
        if (!payload) {
            continue;
        }
        const filePath = path.join(runtimeDir, `${source.key}.json`);
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
        sourceFiles[source.key] = filePath;
    }
    return sourceFiles;
}
function hasSourceChanges(previousHashes, currentHashes) {
    const allKeys = new Set([...Object.keys(previousHashes || {}), ...Object.keys(currentHashes || {})]);
    for (const key of allKeys) {
        if ((previousHashes || {})[key] !== (currentHashes || {})[key]) {
            return true;
        }
    }
    return false;
}
async function runOnce(configPath, statePath) {
    const config = await readJson(configPath);
    await assertHardRequirements(config);
    const state = await readJsonOptional(statePath, {
        sourceHashes: {},
        lastIssueFingerprint: null,
        lastRunAt: null,
        sourceCursors: {},
    });
    const runtimeDir = path.resolve(DEFAULT_RUNTIME_DIR);
    const { payloads, sourceCursors } = await loadSourcePayloads(config, state);
    const currentHashes = computeSourceHashes(payloads);
    const changed = hasSourceChanges(state.sourceHashes, currentHashes);
    if (!changed && config.schedule?.skipIfNoDataChange !== false) {
        process.stdout.write(`[${new Date().toISOString()}] No data changes. Skip run.\n`);
        await fs.mkdir(path.dirname(statePath), { recursive: true });
        await fs.writeFile(statePath, JSON.stringify({
            ...state,
            sourceHashes: currentHashes,
            sourceCursors,
            lastRunAt: new Date().toISOString(),
            skippedReason: 'no_data_change',
        }, null, 2), 'utf8');
        return;
    }
    const createGitHubArtifact = shouldAutoCreateGitHubArtifact(config);
    const sourceFiles = await materializeSourceFiles(config, payloads, runtimeDir);
    const chartManifestPath = await maybeGenerateCharts({
        config,
        payloads,
        runtimeDir,
    });
    const dryRun = await runAnalyzer({
        config,
        runtimeDir,
        sourceFiles,
        createGitHubArtifact: false,
        chartManifestPath,
    });
    const issueFingerprint = buildIssueFingerprint(dryRun.issuesPayload);
    const unchangedIssueSet = issueFingerprint === state.lastIssueFingerprint;
    if (unchangedIssueSet && config.schedule?.skipIfIssueSetUnchanged !== false) {
        process.stdout.write(`[${new Date().toISOString()}] Issue set unchanged. Skip GitHub creation.\n`);
        await fs.mkdir(path.dirname(statePath), { recursive: true });
        await fs.writeFile(statePath, JSON.stringify({
            ...state,
            sourceHashes: currentHashes,
            sourceCursors,
            lastIssueFingerprint: issueFingerprint,
            lastRunAt: new Date().toISOString(),
            lastOutFile: dryRun.outFile,
            skippedReason: 'issue_set_unchanged',
        }, null, 2), 'utf8');
        return;
    }
    if (createGitHubArtifact) {
        await runAnalyzer({
            config,
            runtimeDir,
            sourceFiles,
            createGitHubArtifact: true,
            chartManifestPath,
        });
        process.stdout.write(`[${new Date().toISOString()}] Created GitHub ${getActionMode(config) === 'pull_request' ? 'pull requests' : 'issues'}.\n`);
    }
    else {
        process.stdout.write(`[${new Date().toISOString()}] Drafts generated only (${getActionMode(config)} auto-create disabled).\n`);
    }
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({
        sourceHashes: currentHashes,
        sourceCursors,
        lastIssueFingerprint: issueFingerprint,
        lastRunAt: new Date().toISOString(),
        lastOutFile: dryRun.outFile,
        skippedReason: null,
    }, null, 2), 'utf8');
}
async function main() {
    await loadOpenClawGrowthSecrets();
    const args = parseArgs(process.argv.slice(2));
    const configPath = path.resolve(args.config);
    const statePath = path.resolve(args.state);
    if (!args.loop) {
        await runOnce(configPath, statePath);
        return;
    }
    const config = await readJson(configPath);
    const intervalMinutes = Math.max(1, Number(config.schedule?.intervalMinutes || 1440));
    process.stdout.write(`Starting loop. Interval: ${intervalMinutes} minute(s)\n`);
    while (true) {
        try {
            await runOnce(configPath, statePath);
        }
        catch (error) {
            process.stderr.write(`[${new Date().toISOString()}] Run failed: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        await sleep(intervalMinutes * 60_000);
    }
}
main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
