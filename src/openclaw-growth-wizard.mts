#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { createPrivateKey } from 'node:crypto';
import {
  buildExtraSourceConfig,
  getDefaultSourceCommand,
  getDefaultSourceHint,
  getDefaultSourcePath,
} from './openclaw-growth-shared.mjs';
import { loadOpenClawGrowthSecrets } from './openclaw-growth-env.mjs';

const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const CONNECTOR_KEYS = ['analytics', 'github', 'revenuecat', 'sentry', 'asc'] as const;
type ConnectorKey = (typeof CONNECTOR_KEYS)[number];
type ConnectorDefinition = {
  key: ConnectorKey;
  label: string;
  summary: string;
  needs: string;
};

const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    key: 'analytics',
    label: 'AnalyticsCLI product analytics',
    summary: 'Read product events, funnels, retention, users, and feedback.',
    needs: 'An AnalyticsCLI readonly token from dash.analyticscli.com.',
  },
  {
    key: 'github',
    label: 'GitHub code access',
    summary: 'Read repo context and optionally create issues or draft PRs.',
    needs: 'Create a GitHub token with the scopes you want; you can change it later by rerunning the wizard.',
  },
  {
    key: 'revenuecat',
    label: 'RevenueCat monetization data',
    summary: 'Read subscription, product, entitlement, and revenue context.',
    needs: 'A RevenueCat v2 secret API key with read-only project permissions.',
  },
  {
    key: 'sentry',
    label: 'Sentry-compatible crash monitoring',
    summary: 'Read unresolved crashes, regressions, affected users, releases, and production stability signals.',
    needs: 'A Sentry or GlitchTip-compatible auth token plus the org slug. Project scope is inferred later from app context or config.',
  },
  {
    key: 'asc',
    label: 'ASC / App Store Connect CLI',
    summary: 'Read App Store analytics, reviews/ratings, builds/TestFlight/release context, subscriptions, purchases, and crash totals.',
    needs: 'ASC_KEY_ID, ASC_ISSUER_ID, and the AuthKey_XXXX.p8 content or path.',
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonIfPresent(filePath) {
  if (!(await fileExists(filePath))) return null;
  return readJsonFile(filePath);
}

async function writeJsonFile(filePath, value) {
  await ensureDirForFile(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    } else if (token === '--config') {
      args.config = next || args.config;
      args.out = next || args.out;
      i += 1;
    } else if (token === '--connectors' || token === '--connector-setup') {
      args.connectorWizard = true;
      if (next && !next.startsWith('-')) {
        args.connectors = next;
        i += 1;
      }
    } else if (token === '--out') {
      args.out = next;
      args.config = next;
      i += 1;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
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
  node scripts/openclaw-growth-wizard.mjs --connectors [analytics,github,revenuecat,sentry,asc] [--config <config-path>]
`);
  process.exit(exitCode);
}

function quote(value) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(String(value))) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeConnectorKey(value): ConnectorKey | 'all' | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (!normalized) return null;
  if (normalized === 'all') return 'all';
  if (['analytics', 'analyticscli', 'product-analytics', 'events'].includes(normalized)) return 'analytics';
  if (['github', 'gh', 'github-code', 'codebase', 'code-access'].includes(normalized)) return 'github';
  if (['revenuecat', 'revenue-cat', 'rc', 'revenuecat-mcp'].includes(normalized)) return 'revenuecat';
  if (['sentry', 'sentry-api', 'sentry-mcp', 'crashes', 'errors', 'crash-reporting'].includes(normalized)) return 'sentry';
  if (['asc', 'asc-cli', 'app-store-connect', 'appstoreconnect', 'app-store'].includes(normalized)) return 'asc';
  return null;
}

function parseConnectorList(value): ConnectorKey[] {
  const selected = new Set<ConnectorKey>();
  for (const entry of String(value || '').split(',')) {
    const connector = normalizeConnectorKey(entry);
    if (!connector) continue;
    if (connector === 'all') {
      CONNECTOR_KEYS.forEach((key) => selected.add(key));
    } else {
      selected.add(connector);
    }
  }
  return [...selected];
}

function isConnectorLocallyConfigured(key: ConnectorKey) {
  if (key === 'analytics') {
    return Boolean(process.env.ANALYTICSCLI_ACCESS_TOKEN?.trim() || process.env.ANALYTICSCLI_READONLY_TOKEN?.trim());
  }
  if (key === 'github') return Boolean(process.env.GITHUB_TOKEN?.trim());
  if (key === 'revenuecat') return Boolean(process.env.REVENUECAT_API_KEY?.trim());
  if (key === 'sentry') return Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());
  if (key === 'asc') {
    return Boolean(
      process.env.ASC_KEY_ID?.trim() &&
      process.env.ASC_ISSUER_ID?.trim() &&
      (process.env.ASC_PRIVATE_KEY_PATH?.trim() || process.env.ASC_PRIVATE_KEY?.trim()),
    );
  }
  return false;
}

function getRequiredConnectorKeys() {
  return new Set<ConnectorKey>(isConnectorLocallyConfigured('analytics') ? [] : ['analytics']);
}

function withMissingRequiredAnalyticsConnector(selected: ConnectorKey[]): ConnectorKey[] {
  if (isConnectorLocallyConfigured('analytics') || selected.includes('analytics')) return orderConnectors(selected);
  return orderConnectors(['analytics', ...selected]);
}

async function askConnectorSelection(rl): Promise<ConnectorKey[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    return await askConnectorSelectionByText(rl);
  }

  rl.pause();
  try {
    return await askConnectorSelectionByKeys();
  } finally {
    rl.resume();
  }
}

async function askConnectorSelectionByText(rl): Promise<ConnectorKey[]> {
  printConnectorIntro();
  CONNECTOR_DEFINITIONS.forEach((connector, index) => {
    process.stdout.write(`  ${index + 1}) ${connector.label}\n`);
    process.stdout.write(`     ${connector.summary}\n`);
  });
  while (true) {
    const answer = await ask(rl, 'Select connectors (comma-separated numbers/names, or all)', 'all');
    const selected = parseConnectorAnswer(answer);
    if (selected.length > 0) return selected;
    process.stdout.write('\nChoose at least one connector.\n\n');
  }
}

function parseConnectorAnswer(answer): ConnectorKey[] {
  const selected = new Set<ConnectorKey>();
  for (const rawEntry of String(answer || '').split(',')) {
    const entry = rawEntry.trim().toLowerCase();
    const numericConnector = CONNECTOR_DEFINITIONS[Number(entry) - 1]?.key;
    if (numericConnector) selected.add(numericConnector);
    const key = normalizeConnectorKey(entry);
    if (key === 'all') CONNECTOR_KEYS.forEach((connector) => selected.add(connector));
    if (key && key !== 'all') selected.add(key);
  }
  return orderConnectors([...selected]);
}

function orderConnectors(keys: ConnectorKey[]): ConnectorKey[] {
  const selected = new Set(keys);
  return CONNECTOR_KEYS.filter((key) => selected.has(key));
}

function printConnectorIntro() {
  process.stdout.write(`\n${ANSI.bold}OpenClaw connector setup${ANSI.reset}\n`);
  process.stdout.write(`${ANSI.dim}Secrets stay local on this host. Do not paste them into Discord/OpenClaw chat.${ANSI.reset}\n\n`);
}

function connectorLabel(key: ConnectorKey) {
  return CONNECTOR_DEFINITIONS.find((connector) => connector.key === key)?.label ?? key;
}

function toConfigId(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

function toEnvName(value, fallback) {
  return String(value || fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

function renderConnectorPicker(cursorIndex: number, selected: Set<ConnectorKey>, required: Set<ConnectorKey>, warning = '') {
  process.stdout.write('\x1b[2J\x1b[H');
  printConnectorIntro();
  process.stdout.write(`${ANSI.bold}Select connectors to set up or overwrite now${ANSI.reset}\n`);
  process.stdout.write(`${ANSI.dim}Use Up/Down to move, Space to toggle optional connectors, A to toggle all optional connectors, Enter to continue.${ANSI.reset}\n\n`);

  CONNECTOR_DEFINITIONS.forEach((connector, index) => {
    const active = index === cursorIndex;
    const isRequired = required.has(connector.key);
    const configured = isConnectorLocallyConfigured(connector.key);
    const checked = isRequired || selected.has(connector.key);
    const pointer = active ? `${ANSI.cyan}>${ANSI.reset}` : ' ';
    const box = checked ? `${ANSI.green}[x]${ANSI.reset}` : '[ ]';
    const suffix = isRequired ? ' (required baseline, missing)' : configured ? ' (local values found)' : '';
    const label = `${connector.label}${suffix}`;
    const title = active ? `${ANSI.bold}${label}${ANSI.reset}` : label;
    process.stdout.write(`${pointer} ${box} ${title}\n`);
    process.stdout.write(`    ${connector.summary}\n`);
    process.stdout.write(`    ${ANSI.dim}Needs: ${connector.needs}${ANSI.reset}\n`);
    if (configured && !checked) {
      process.stdout.write(`    ${ANSI.dim}Local values found; this is not a live health result. Unchecked keeps them unchanged.${ANSI.reset}\n`);
    }
    process.stdout.write('\n');
  });

  if (warning) {
    process.stdout.write(`${ANSI.bold}${warning}${ANSI.reset}\n\n`);
  }
  process.stdout.write(`${ANSI.dim}Esc/Q cancels. Number keys 1-${CONNECTOR_DEFINITIONS.length} also toggle connectors.${ANSI.reset}\n`);
}

async function askConnectorSelectionByKeys(): Promise<ConnectorKey[]> {
  emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let cursorIndex = 0;
  const required = getRequiredConnectorKeys();
  const selected = new Set<ConnectorKey>(
    CONNECTOR_KEYS.filter((key) => required.has(key) || !isConnectorLocallyConfigured(key)),
  );
  let warning = '';

  return await new Promise<ConnectorKey[]>((resolve, reject) => {
    const cleanup = () => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdout.write(ANSI.showCursor);
    };

    const finish = () => {
      required.forEach((key) => selected.add(key));
      if (selected.size === 0) {
        warning = 'No connectors selected. Select a connector to update or press Esc to cancel.';
        renderConnectorPicker(cursorIndex, selected, required, warning);
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
      if (required.has(key)) {
        selected.add(key);
        warning = 'AnalyticsCLI is missing and required for the Growth Engineer baseline.';
        return;
      }
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      warning = '';
    };

    const toggleAll = () => {
      const optionalKeys = CONNECTOR_KEYS.filter((key) => !required.has(key));
      const allOptionalSelected = optionalKeys.every((key) => selected.has(key));
      if (allOptionalSelected) optionalKeys.forEach((key) => selected.delete(key));
      else optionalKeys.forEach((key) => selected.add(key));
      required.forEach((key) => selected.add(key));
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
      } else if (key?.name === 'down' || key?.name === 'j') {
        cursorIndex = (cursorIndex + 1) % CONNECTOR_DEFINITIONS.length;
        warning = '';
      } else if (key?.name === 'space') {
        toggleCurrent();
      } else if (key?.name === 'a') {
        toggleAll();
      } else if (key?.name === 'return' || key?.name === 'enter') {
        finish();
        return;
      } else if (/^[1-9]$/.test(String(_text || ''))) {
        const index = Number(_text) - 1;
        const connector = CONNECTOR_DEFINITIONS[index];
        if (connector) {
          cursorIndex = index;
          if (required.has(connector.key)) {
            selected.add(connector.key);
            warning = 'AnalyticsCLI is missing and required for the Growth Engineer baseline.';
          } else {
            if (selected.has(connector.key)) selected.delete(connector.key);
            else selected.add(connector.key);
            warning = '';
          }
        }
      }
      renderConnectorPicker(cursorIndex, selected, required, warning);
    };

    process.stdin.on('keypress', onKeypress);
    process.stdout.write(ANSI.hideCursor);
    renderConnectorPicker(cursorIndex, selected, required, warning);
  });
}

async function commandExists(commandName) {
  const result = await runInteractiveCommand(`command -v ${quote(commandName)} >/dev/null 2>&1`, {
    silent: true,
  });
  return result === 0;
}

async function runInteractiveCommand(command, options: { env?: NodeJS.ProcessEnv; silent?: boolean } = {}) {
  return await new Promise<number | null>((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      env: options.env ?? process.env,
      stdio: options.silent ? 'ignore' : 'inherit',
    });
    child.on('close', (code) => resolve(code));
  });
}

async function runCommandCapture(command, options: { env?: NodeJS.ProcessEnv } = {}) {
  return await new Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      resolve({ ok: false, stdout, stderr: error.message, code: null });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
}

async function runCommandCaptureWithProgress(
  command,
  onProgress,
  options: { env?: NodeJS.ProcessEnv } = {},
) {
  return await new Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let stderrBuffer = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/^OPENCLAW_PROGRESS\s+(.+)$/);
        if (!match) continue;
        try {
          onProgress(JSON.parse(match[1]));
        } catch {
          // Ignore malformed progress events; the final JSON result is authoritative.
        }
      }
    });
    child.on('error', (error) => {
      resolve({ ok: false, stdout, stderr: error.message, code: null });
    });
    child.on('close', (code) => {
      const match = stderrBuffer.match(/^OPENCLAW_PROGRESS\s+(.+)$/);
      if (match) {
        try {
          onProgress(JSON.parse(match[1]));
        } catch {
          // Ignore malformed progress events; the final JSON result is authoritative.
        }
      }
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
}

function truncate(value, maxLength = 900) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function parseJsonFromStdout(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return null;
  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  const starts = [firstBrace, firstBracket].filter((index) => index >= 0);
  if (starts.length === 0) return null;
  try {
    return JSON.parse(raw.slice(Math.min(...starts)));
  } catch {
    return null;
  }
}

function clearTerminal() {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[H');
  }
}

function printConnectorSetupProgress(payload) {
  const connectorSetup = Array.isArray(payload?.connectorSetup) ? payload.connectorSetup : [];
  const okConnectors = connectorSetup.filter((entry) => entry?.ok).map((entry) => entry.connector).filter(Boolean);
  if (okConnectors.length > 0) {
    process.stdout.write(`Connected: ${okConnectors.join(', ')}.\n`);
  }
}

async function askAnalyticsProjectFromSetupPayload(rl, payload) {
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  if (projects.length === 0) return '';

  process.stdout.write('\nSetup needs one AnalyticsCLI project before it can finish.\n');
  projects.forEach((project, index) => {
    const label = project.label || project.name || project.slug || project.id;
    process.stdout.write(`  ${index + 1}) ${label} (${project.id})\n`);
  });

  while (true) {
    const answer = await ask(rl, 'AnalyticsCLI project number or ID', projects.length === 1 ? projects[0].id : '');
    const numericIndex = Number.parseInt(answer, 10);
    if (Number.isInteger(numericIndex) && projects[numericIndex - 1]?.id) {
      return projects[numericIndex - 1].id;
    }
    const matchingProject = projects.find((project) => project.id === answer || project.name === answer || project.slug === answer);
    if (matchingProject?.id) return matchingProject.id;
    process.stdout.write('Choose one of the listed project numbers, or paste the exact project ID.\n');
  }
}

function printSetupFailure({ result, payload, command }) {
  process.stdout.write('\nFAILED: Connector setup needs attention.\n');
  printConnectorSetupProgress(payload);

  const blockers = Array.isArray(payload?.blockers) ? payload.blockers : [];
  if (blockers.length > 0) {
    process.stdout.write('\nNext steps:\n');
    blockers.forEach((blocker, index) => {
      process.stdout.write(`${index + 1}. ${blocker.detail || blocker.check || 'Configuration check failed'}\n`);
      if (blocker.remediation) {
        process.stdout.write(`   Fix: ${blocker.remediation}\n`);
      }
    });
    process.stdout.write(`\nAfter fixing the configuration, rerun: ${command}\n`);
    return;
  }

  const reason = result.code === null ? 'setup command did not report an exit code' : `setup command exited with code ${result.code}`;
  process.stdout.write(`Reason: ${reason}.\n`);
  const output = truncate(result.stderr || result.stdout);
  if (output) {
    process.stdout.write(`Details: ${output}\n`);
  }
  process.stdout.write(`Run manually for full output: ${command}\n`);
}

function printSetupSuccess(payload) {
  process.stdout.write('\nSUCCESS: Connector setup finished.\n');
  printConnectorSetupProgress(payload);
  if (payload?.message) {
    process.stdout.write(`${payload.message}\n`);
  }
}

function healthCheckFailures(payload) {
  return Array.isArray(payload?.checks)
    ? payload.checks.filter((check) => check?.status === 'fail')
    : [];
}

function connectorFromCheckName(name) {
  const value = String(name || '');
  if (value.includes('analytics') || value.includes('ANALYTICSCLI')) return 'analytics';
  if (value.includes('github') || value.includes('GITHUB')) return 'github';
  if (value.includes('revenuecat') || value.includes('REVENUECAT')) return 'revenuecat';
  if (value.includes('sentry') || value.includes('SENTRY') || value.includes('GLITCHTIP')) return 'sentry';
  if (value.includes('asc') || value.includes('ASC_')) return 'asc';
  return null;
}

function connectorTitle(key) {
  return CONNECTOR_DEFINITIONS.find((connector) => connector.key === key)?.label || key || 'General setup';
}

function compactJsonError(value) {
  const text = String(value || '');
  const jsonStart = text.indexOf('{"error"');
  if (jsonStart < 0) return '';
  try {
    const payload = JSON.parse(text.slice(jsonStart).replace(/\)+\s*$/g, '').trim());
    const error = payload?.error || payload;
    const parts = [
      error.code ? `code=${error.code}` : '',
      error.message ? `message=${error.message}` : '',
      error.details?.reason ? `reason=${error.details.reason}` : '',
    ].filter(Boolean);
    return parts.join(', ');
  } catch {
    return '';
  }
}

function cleanHealthDetail(detail) {
  const raw = String(detail || '').replace(/\s+/g, ' ').trim();
  const compactError = compactJsonError(raw);

  if (/project\.githubRepo is required/i.test(raw)) {
    return 'No GitHub repo is configured yet. This is optional unless you want GitHub issue/PR delivery now.';
  }
  if (/project\.githubRepo is missing/i.test(raw)) {
    return 'GitHub repo access test is deferred until a repo is known.';
  }
  if (/invalid token|unauthorized|token has been revoked/i.test(raw)) {
    return `AnalyticsCLI token is invalid${compactError ? ` (${compactError})` : ''}.`;
  }
  if (/No Sentry projects configured/i.test(raw)) {
    return 'Sentry project scope is deferred; the AI can discover visible projects from org + token.';
  }
  if (/smoke test failed/i.test(raw)) {
    const withoutWrappedJson = raw.replace(/\{"error".*$/, '').replace(/\s*\(+\s*$/, '').trim();
    return withoutWrappedJson || raw;
  }
  return truncate(raw, 180);
}

function actionForHealthFailure(failure, configPath) {
  const name = String(failure?.name || '');
  const detail = String(failure?.detail || '');
  if (name === 'project:github-repo' || /project\.githubRepo/i.test(detail)) {
    return `No action required for Sentry setup. Set project.githubRepo in ${configPath} only if you want GitHub issue/PR delivery now.`;
  }
  if (name.includes('analytics') || /ANALYTICSCLI|analytics/i.test(detail)) {
    return 'Paste a fresh AnalyticsCLI readonly token, then let the wizard retest AnalyticsCLI.';
  }
  if (name.includes('sentry') || /Sentry|GlitchTip/i.test(detail)) {
    return 'Only fix this if token, org, or base URL is missing or invalid.';
  }
  if (name.includes('github')) {
    return 'Configure GitHub token/repo access, or leave GitHub delivery disabled.';
  }
  if (name.includes('revenuecat')) {
    return 'Paste a RevenueCat v2 secret API key with read-only project permissions.';
  }
  if (name.includes('asc')) {
    return 'Paste ASC API key details or rerun ASC setup when ready.';
  }
  return 'Use the connector setup flow below to refresh this configuration.';
}

function isDeferredGitHubFailure(failure) {
  const name = String(failure?.name || '');
  const detail = String(failure?.detail || '');
  return (
    name === 'project:github-repo' ||
    (name === 'connection:github' && /project\.githubRepo|repo is missing|repo is not configured/i.test(detail))
  );
}

function isDeferredSentryProjectFailure(failure) {
  const name = String(failure?.name || '');
  const detail = String(failure?.detail || '');
  return name.includes('sentry') && /No Sentry projects configured/i.test(detail);
}

function summarizeHealthFailure(failure, configPath) {
  const name = String(failure?.name || '');
  const detail = String(failure?.detail || '');
  const connector = connectorFromCheckName(`${name} ${detail}`) || 'setup';
  if (connector === 'analytics' && /invalid token|unauthorized|token has been revoked/i.test(detail)) {
    return {
      connector,
      status: 'token invalid or expired',
      action: 'paste a fresh readonly token',
    };
  }
  if (connector === 'sentry' && /No Sentry projects configured/i.test(detail)) {
    return {
      connector,
      status: 'project scope deferred',
      action: 'no user action; OpenClaw discovers visible projects from org + token',
    };
  }
  if (connector === 'github' && isDeferredGitHubFailure(failure)) {
    return {
      connector,
      status: 'repo not known yet',
      action: `optional; set project.githubRepo in ${configPath} only for GitHub delivery`,
    };
  }
  return {
    connector,
    status: cleanHealthDetail(detail),
    action: actionForHealthFailure(failure, configPath),
  };
}

function printHealthFailures(failures, configPath) {
  const summarized = [];
  const seen = new Set();
  for (const failure of failures) {
    if (isDeferredGitHubFailure(failure)) continue;
    if (isDeferredSentryProjectFailure(failure)) continue;
    const summary = summarizeHealthFailure(failure, configPath);
    const key = `${summary.connector}:${summary.status}:${summary.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summarized.push(summary);
  }

  if (summarized.length === 0) {
    process.stdout.write('\nOnly deferred optional checks remain.\n\n');
    return;
  }

  process.stdout.write('\nNeeds attention\n');
  process.stdout.write('---------------\n');
  for (const summary of summarized) {
    process.stdout.write(`- ${connectorTitle(summary.connector)}: ${summary.status}\n`);
    process.stdout.write(`  Next: ${summary.action}\n`);
  }
  process.stdout.write('\n');
}

function inferConnectorsFromHealthFailures(failures) {
  const inferred = new Set<ConnectorKey>();
  for (const failure of failures) {
    if (isDeferredGitHubFailure(failure)) continue;
    if (isDeferredSentryProjectFailure(failure)) continue;
    const connector = connectorFromCheckName(`${failure?.name || ''} ${failure?.detail || ''}`);
    if (connector) inferred.add(connector);
  }
  return orderConnectors([...inferred]);
}

async function getHealthCheckPlan(configPath, selected: ConnectorKey[]) {
  const config = await readJsonIfPresent(configPath).catch(() => null);
  const items = [
    {
      key: 'preflight',
      label: 'Local preflight',
      detail: 'config, dependencies, source wiring',
      status: 'pending',
    },
  ];
  const selectedSet = new Set(selected);
  const hasAnalytics =
    selectedSet.has('analytics') ||
    Boolean(process.env.ANALYTICSCLI_ACCESS_TOKEN?.trim() || process.env.ANALYTICSCLI_READONLY_TOKEN?.trim()) ||
    (config?.sources?.analytics && config.sources.analytics.enabled !== false);
  const sentryAccounts = Array.isArray(config?.sources?.sentry?.accounts) ? config.sources.sentry.accounts : [];
  const hasSentry =
    selectedSet.has('sentry') ||
    sentryAccounts.length > 0 ||
    Boolean(process.env.SENTRY_AUTH_TOKEN?.trim() || process.env.GLITCHTIP_AUTH_TOKEN?.trim());
  const hasRevenueCat =
    selectedSet.has('revenuecat') ||
    Boolean(process.env.REVENUECAT_API_KEY?.trim()) ||
    (config?.sources?.revenuecat && config.sources.revenuecat.enabled !== false);
  const githubRepo = String(config?.project?.githubRepo || '').trim();
  const hasGitHub = selectedSet.has('github') || Boolean(process.env.GITHUB_TOKEN?.trim()) || Boolean(githubRepo);

  if (hasAnalytics) items.push({ key: 'analytics', label: 'AnalyticsCLI', detail: 'token auth + readonly query', status: 'pending' });
  if (hasSentry) items.push({ key: 'sentry', label: 'Sentry / GlitchTip', detail: 'token/org API + project discovery', status: 'pending' });
  if (hasRevenueCat) items.push({ key: 'revenuecat', label: 'RevenueCat', detail: 'API key auth + project read', status: 'pending' });
  if (hasGitHub && githubRepo) items.push({ key: 'github', label: 'GitHub', detail: `repo access (${githubRepo})`, status: 'pending' });
  if (hasGitHub && !githubRepo) items.push({ key: 'github', label: 'GitHub', detail: 'skipped until repo is known', status: 'pending' });
  return items;
}

function healthStatusLabel(status) {
  if (status === 'running') return 'running';
  if (status === 'pass') return 'done';
  if (status === 'warn') return 'needs attention';
  if (status === 'fail') return 'needs attention';
  if (status === 'deferred') return 'deferred';
  return 'pending';
}

function renderHealthProgress(items, message = 'Live checks running...') {
  if (process.stdout.isTTY) clearTerminal();
  process.stdout.write('Health check\n');
  process.stdout.write('------------\n');
  process.stdout.write(`${message}\n\n`);
  for (const item of items) {
    process.stdout.write(`[${healthStatusLabel(item.status)}] ${item.label}: ${item.detail}\n`);
  }
}

function updateHealthProgress(items, event) {
  const key = String(event?.key || '');
  const item = items.find((entry) => entry.key === key);
  if (!item) return false;
  if (event.phase === 'start') {
    item.status = 'running';
    if (event.detail) item.detail = String(event.detail);
    if (event.label) item.label = String(event.label);
    return true;
  }
  if (event.phase === 'finish') {
    item.status = event.status || 'pass';
    if (event.detail) item.detail = String(event.detail);
    if (event.label) item.label = String(event.label);
    return true;
  }
  return false;
}

async function offerConfiguredConnectionFixes(rl, configPath, selected) {
  if (!(await fileExists(configPath))) return selected;

  clearTerminal();
  const plan = await getHealthCheckPlan(configPath, selected);
  renderHealthProgress(plan, 'Starting live checks...');
  const command = `node scripts/openclaw-growth-preflight.mjs --config ${quote(configPath)} --test-connections --progress-json`;
  const result = await runCommandCaptureWithProgress(command, (event) => {
    if (updateHealthProgress(plan, event)) {
      renderHealthProgress(plan);
    }
  });
  renderHealthProgress(plan, 'Checks finished.');
  const payload = parseJsonFromStdout(result.stdout);
  const failures = healthCheckFailures(payload).filter(
    (failure) => !isDeferredGitHubFailure(failure) && !isDeferredSentryProjectFailure(failure),
  );

  if (payload?.ok === true || failures.length === 0) {
    process.stdout.write('Configured connectors look healthy.\n\n');
    return selected;
  }

  printHealthFailures(failures, configPath);

  const inferred = inferConnectorsFromHealthFailures(failures);
  if (inferred.length === 0) {
    process.stdout.write('Continuing with the connector(s) you selected.\n\n');
    return selected;
  }

  const fixNow = await askYesNo(rl, `Fix now (${inferred.join(', ')})?`, true);
  clearTerminal();
  if (!fixNow) {
    process.stdout.write('Continuing with selected connector(s).\n\n');
    return selected;
  }

  return orderConnectors([...new Set([...selected, ...inferred])]);
}

function getUserLocalBinDir() {
  return process.env.HOME ? path.join(process.env.HOME, '.local', 'bin') : null;
}

function prependPath(dir: string) {
  const current = process.env.PATH || '';
  if (!current.split(':').includes(dir)) {
    process.env.PATH = `${dir}:${current}`;
  }
}

function getGitHubCliReleaseAssetName(version: string) {
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
  const release = await response.json() as {
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  };
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
  } catch (error) {
    process.stdout.write(`Automatic gh install failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return false;
  }
}

function parseGitHubRepoFromRemote(remoteUrl) {
  const value = String(remoteUrl || '').trim();
  if (!value) return null;

  const sshMatch = value.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch) return sshMatch[1];

  const httpsMatch = value.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

function isConfiguredGitHubRepo(value) {
  const repo = String(value || '').trim();
  return Boolean(repo && repo !== 'owner/repo' && /^[^/\s]+\/[^/\s]+$/.test(repo));
}

async function detectGitHubRepo() {
  const explicit = String(process.env.OPENCLAW_GITHUB_REPO || '').trim();
  if (isConfiguredGitHubRepo(explicit)) return explicit;

  const remoteResult = await runCommandCapture('git config --get remote.origin.url');
  if (!remoteResult.ok) return null;
  return parseGitHubRepoFromRemote(remoteResult.stdout);
}

function resolveSecretsFile() {
  const explicit = process.env.OPENCLAW_GROWTH_SECRETS_FILE?.trim();
  if (explicit) return path.resolve(explicit);
  if (process.env.HOME) return path.join(process.env.HOME, '.config', 'openclaw-growth', 'secrets.env');
  return path.resolve('.openclaw-growth-secrets.env');
}

function resolveAscPrivateKeyPath(keyId: string) {
  const safeKeyId = (keyId || 'OPENCLAW').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'OPENCLAW';
  const baseDir = process.env.HOME
    ? path.join(process.env.HOME, '.config', 'openclaw-growth')
    : path.resolve('.openclaw-growth');
  return path.join(baseDir, `AuthKey_${safeKeyId}.p8`);
}

function renderEnvValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}

async function readSecretsFile(filePath) {
  const values = new Map<string, string>();
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return values;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)\s*$/);
    if (!match) continue;
    values.set(match[1], match[2].replace(/^"|"$/g, ''));
  }
  return values;
}

async function writeSecretsFile(filePath, nextValues: Record<string, string>) {
  const current = await readSecretsFile(filePath);
  for (const [key, value] of Object.entries(nextValues)) {
    if (value.trim()) current.set(key, value.trim());
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
  const suffix = existing ? 'already set in current environment; press Enter to keep' : 'leave empty to skip';
  const value = await ask(rl, `${label} (${suffix})`, '');
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  if (existing) {
    process.stdout.write(`Keeping existing ${envName} from the local environment.\n`);
    return existing;
  }
  return '';
}

function defaultSentryTokenEnv({ index, label, baseUrl }) {
  const value = `${label || ''} ${baseUrl || ''}`.toLowerCase();
  if (index === 0 && !value.includes('glitchtip')) return 'SENTRY_AUTH_TOKEN';
  if (value.includes('glitchtip')) return 'GLITCHTIP_AUTH_TOKEN';
  return `${toEnvName(label || `SENTRY_${index + 1}`, `SENTRY_${index + 1}`)}_AUTH_TOKEN`;
}

function defaultSentryAccountLabel({ index, baseUrl }) {
  const value = String(baseUrl || '').toLowerCase();
  if (value.includes('glitchtip')) return 'GlitchTip';
  if (index === 0) return 'Sentry Cloud';
  return `Sentry Account ${index + 1}`;
}

function parseCommaList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildUrl(baseUrl, pathname, params: Record<string, string | number | boolean | null | undefined> = {}) {
  const url = new URL(pathname, `${String(baseUrl || 'https://sentry.io').replace(/\/$/, '')}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function discoverSentryProjects({ baseUrl, token, org }) {
  const normalizedOrg = String(org || '').trim();
  const normalizedToken = String(token || '').trim();
  if (!normalizedOrg || !normalizedToken) {
    return { ok: false, projects: [], detail: 'missing org or token' };
  }

  try {
    const response = await fetch(buildUrl(baseUrl, `/api/0/organizations/${encodeURIComponent(normalizedOrg)}/projects/`, {
      per_page: 100,
    }), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizedToken}`,
        'User-Agent': 'openclaw-growth-wizard',
      },
    });
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, projects: [], detail: `HTTP ${response.status}: ${truncate(body, 500)}` };
    }
    const payload = body ? JSON.parse(body) : [];
    const projects = (Array.isArray(payload) ? payload : [])
      .map((project) => String(project?.slug || project?.name || '').trim())
      .filter(Boolean);
    return { ok: true, projects: [...new Set(projects)], detail: `found ${projects.length} project(s)` };
  } catch (error) {
    return {
      ok: false,
      projects: [],
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function upsertSentryAccountsConfig(configPath, accounts) {
  if (!accounts.length || !(await fileExists(configPath))) return false;
  const config = await readJsonFile(configPath);
  const existingAccounts = Array.isArray(config?.sources?.sentry?.accounts)
    ? config.sources.sentry.accounts
    : [];
  const merged = new Map();
  for (const account of existingAccounts) {
    const id = String(account?.id || account?.key || account?.label || '').trim();
    if (id) merged.set(id, account);
  }
  for (const account of accounts) {
    merged.set(account.id, {
      ...(merged.get(account.id) || {}),
      ...account,
    });
  }

  config.sources = {
    ...(config.sources || {}),
    sentry: {
      ...(config.sources?.sentry || {}),
      enabled: true,
      mode: 'command',
      command: getDefaultSourceCommand('sentry'),
      accounts: [...merged.values()],
    },
  };

  await writeJsonFile(configPath, config);
  return true;
}

const ASC_PRIVATE_KEY_BEGIN = '-----BEGIN PRIVATE KEY-----';
const ASC_PRIVATE_KEY_END = '-----END PRIVATE KEY-----';
const BRACKETED_PASTE_START = new RegExp(`${String.fromCharCode(27)}\\[200~`, 'g');
const BRACKETED_PASTE_END = new RegExp(`${String.fromCharCode(27)}\\[201~`, 'g');

function formatPemBase64(value) {
  return String(value || '').match(/.{1,64}/g)?.join('\n') || '';
}

function normalizeAscPrivateKeyContent(value) {
  const raw = String(value || '')
    .replace(BRACKETED_PASTE_START, '')
    .replace(BRACKETED_PASTE_END, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!raw) {
    return { ok: false, value: '', error: 'No private key content pasted.' };
  }

  const beginIndex = raw.indexOf(ASC_PRIVATE_KEY_BEGIN);
  const endIndex = raw.indexOf(ASC_PRIVATE_KEY_END);
  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    if (raw.includes('-----BEGIN PRIVATE KEY') && beginIndex < 0) {
      return {
        ok: false,
        value: '',
        error: `Malformed .p8 header. The first line must be exactly ${ASC_PRIVATE_KEY_BEGIN}`,
      };
    }
    if (raw.includes('-----END PRIVATE KEY') && endIndex < 0) {
      return {
        ok: false,
        value: '',
        error: `Malformed .p8 footer. The last line must be exactly ${ASC_PRIVATE_KEY_END}`,
      };
    }
    return {
      ok: false,
      value: '',
      error: `Missing exact .p8 markers. Paste from ${ASC_PRIVATE_KEY_BEGIN} through ${ASC_PRIVATE_KEY_END}.`,
    };
  }

  const body = raw
    .slice(beginIndex + ASC_PRIVATE_KEY_BEGIN.length, endIndex)
    .replace(/\s+/g, '');
  if (!body) {
    return { ok: false, value: '', error: 'The .p8 key body is empty.' };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) {
    return {
      ok: false,
      value: '',
      error: 'The .p8 key body contains non-base64 characters. Copy the downloaded AuthKey file content without redactions or extra text.',
    };
  }

  return {
    ok: true,
    value: `${ASC_PRIVATE_KEY_BEGIN}\n${formatPemBase64(body)}\n${ASC_PRIVATE_KEY_END}\n`,
    error: null,
  };
}

function validateAscPrivateKeyContent(value) {
  const normalized = normalizeAscPrivateKeyContent(value);
  if (!normalized.ok) return normalized;
  try {
    createPrivateKey(normalized.value);
    return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      value: '',
      error: `Invalid .p8 private key content: ${message}. Make sure you copied the downloaded AuthKey_<KEY_ID>.p8 file, including both marker lines, with no truncation.`,
    };
  }
}

async function askAscPrivateKeyContent(rl) {
  process.stdout.write(
    '\nPaste the full .p8 file content here. Leave the first line empty if you already saved the .p8 file on this host.\n',
  );
  process.stdout.write('The wizard validates the pasted key, stores it locally with chmod 600, and only saves ASC_PRIVATE_KEY_PATH.\n');

  while (true) {
    const value = await readAscPrivateKeyPaste(rl);
    if (!value.trim()) return '';
    const validation = validateAscPrivateKeyContent(value);
    if (validation.ok) return validation.value;

    process.stdout.write(`${validation.error}\n`);
    process.stdout.write('The .p8 was not saved. Paste the full file again from BEGIN to END, or leave empty to use a path.\n');
  }
}

async function readAscPrivateKeyPaste(rl) {
  return await new Promise<string>((resolve, reject) => {
    let buffer = '';
    let settled = false;
    let lineCount = 0;
    const previousEncoding = process.stdin.readableEncoding;

    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.off('error', onError);
      if (previousEncoding) process.stdin.setEncoding(previousEncoding);
      rl.resume();
    };

    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value ? `${String(value).trim()}\n` : '');
    };

    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onData = (chunk) => {
      buffer += String(chunk);
      lineCount = buffer.split(/\r?\n/).length;

      if (/^\s*(?:\r?\n)/.test(buffer)) {
        finish('');
        return;
      }

      const endMatch = buffer.match(/-----END PRIVATE KEY-----[^\r\n]*(?:\r?\n|$)/);
      if (endMatch?.index !== undefined) {
        finish(buffer.slice(0, endMatch.index + endMatch[0].length));
        return;
      }

      if (lineCount > 80) {
        process.stdout.write('Paste looks incomplete: no -----END PRIVATE KEY----- line found within 80 lines.\n');
        finish('');
      }
    };

    rl.pause();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('error', onError);
    process.stdout.write('ASC_PRIVATE_KEY content: ');
    process.stdin.resume();
  });
}

async function validateAscPrivateKeyPath(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return validateAscPrivateKeyContent(raw);
}

async function askAscPrivateKeyPath(rl) {
  while (true) {
    const privateKeyPath = await ask(
      rl,
      'ASC_PRIVATE_KEY_PATH (path to AuthKey_XXXX.p8, leave empty to skip)',
      process.env.ASC_PRIVATE_KEY_PATH || '',
    );
    const trimmedPath = privateKeyPath.trim();
    if (!trimmedPath) return '';

    try {
      const validation = await validateAscPrivateKeyPath(trimmedPath);
      if (validation.ok) return trimmedPath;
      process.stdout.write(`${validation.error}\n`);
    } catch (error) {
      process.stdout.write(`Could not read .p8 file: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.stdout.write('The ASC private key path was not saved. Paste a valid path, or leave empty to skip.\n');
  }
}

function isAscWebAuthAuthenticated(stdout) {
  try {
    const payload = JSON.parse(String(stdout || '{}'));
    return payload?.authenticated === true;
  } catch {
    return false;
  }
}

async function ensureAscWebAnalyticsAuth() {
  process.stdout.write('\nChecking ASC web analytics authentication...\n');
  if (!(await commandExists('asc'))) {
    throw new Error(
      'The asc CLI is not installed yet. Install it with `openclaw start --connectors asc`, then rerun the connector wizard so it can run `asc web auth login`.',
    );
  }

  const status = await runCommandCapture('asc web auth status --output json');
  if (status.ok && isAscWebAuthAuthenticated(status.stdout)) {
    process.stdout.write('ASC web analytics authentication is active.\n');
    return;
  }

  process.stdout.write('ASC web analytics needs a website login. Starting `asc web auth login` now.\n');
  process.stdout.write('Complete the App Store Connect login flow, then return to this terminal.\n\n');
  const loginCode = await runInteractiveCommand('asc web auth login');
  if (loginCode !== 0) {
    throw new Error('ASC web analytics login failed. Run `asc web auth login` manually, then rerun the connector wizard.');
  }

  const verify = await runCommandCapture('asc web auth status --output json');
  if (!verify.ok || !isAscWebAuthAuthenticated(verify.stdout)) {
    throw new Error(
      'ASC web analytics login did not verify. Run `asc web auth status --output json --pretty` to inspect the session, then rerun the connector wizard.',
    );
  }

  process.stdout.write('ASC web analytics authentication verified.\n');
}

function printSection(title: string, lines: string[] = []) {
  process.stdout.write(`\n${ANSI.bold}${title}${ANSI.reset}\n`);
  process.stdout.write(`${'-'.repeat(title.length)}\n`);
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
  if (lines.length > 0) process.stdout.write('\n');
}

function printBullets(lines: string[]) {
  for (const line of lines) {
    process.stdout.write(`  - ${line}\n`);
  }
  process.stdout.write('\n');
}

async function guideGitHubConnector(rl, secrets: Record<string, string>) {
  printSection('GitHub code access', [
    'Use this when OpenClaw should read repo context or create GitHub delivery artifacts.',
  ]);
  printBullets([
    'Open the token page, select the scopes you want, then paste the token here.',
    'You can rerun this wizard later to change GitHub permissions.',
  ]);

  let hasGh = await commandExists('gh');
  if (!hasGh) {
    hasGh = await installGitHubCliUserLocal();
  }
  if (hasGh) {
    process.stdout.write('GitHub CLI is available for helper commands.\n\n');
  }

  process.stdout.write('Token URL: https://github.com/settings/tokens/new\n\n');
  process.stdout.write(`${ANSI.bold}Suggested scopes${ANSI.reset}\n`);
  printBullets([
    'Public repo only: select `public_repo`.',
    'Private repo access: select `repo` (classic GitHub tokens make private repo access broad).',
    'Create issues / draft PRs in private repos: `repo` is the relevant classic-token scope.',
    'Edit GitHub Actions workflow files: add `workflow` only if you explicitly want this.',
    'Usually do not select: packages, admin:org, hooks, gist, user, delete_repo, enterprise, codespace, copilot.',
  ]);

  const token = await maybePromptSecret(rl, 'Paste GITHUB_TOKEN into this local terminal', 'GITHUB_TOKEN');
  if (token) secrets.GITHUB_TOKEN = token;
  else process.stdout.write('No GitHub token saved. GitHub setup remains pending; rerun this wizard when ready.\n\n');

  const detectedRepo = await detectGitHubRepo();
  if (detectedRepo) {
    secrets.OPENCLAW_GITHUB_REPO = detectedRepo;
    process.stdout.write(`Detected GitHub repo for this workspace: ${detectedRepo}\n\n`);
  } else if (token || process.env.GITHUB_TOKEN) {
    process.stdout.write('GitHub auth is saved. Repo selection is deferred per app/task; no global repo is required.\n\n');
  }
}

async function guideAnalyticsConnector(rl, secrets: Record<string, string>) {
  printSection('AnalyticsCLI', [
    'Paste a readonly token. The setup step will validate it and select a project when needed.',
    'Token page: https://dash.analyticscli.com/',
  ]);
  const token = await maybePromptSecret(
    rl,
    'Paste AnalyticsCLI readonly token into this local terminal',
    'ANALYTICSCLI_ACCESS_TOKEN',
  );
  if (token) secrets.ANALYTICSCLI_ACCESS_TOKEN = token;
  else process.stdout.write('No AnalyticsCLI token saved. Product analytics setup remains pending; rerun this wizard when ready.\n\n');
}

async function guideRevenueCatConnector(rl, secrets: Record<string, string>) {
  printSection('RevenueCat monetization data', [
    'Use this when OpenClaw should read subscription, product, entitlement, and revenue context.',
  ]);
  process.stdout.write('\nCreate a RevenueCat secret API key here:\n  https://app.revenuecat.com/\n\n');
  printBullets([
    'Select your app.',
    'In the sidebar, choose "Apps & providers".',
    'Click "API keys" and generate a new secret API key.',
    'Name it "analyticscli" and choose API version 2.',
    'Set Charts metrics permissions to read.',
    'Set Customer information permissions to read.',
    'Set Project configuration permissions to read.',
  ]);
  const apiKey = await maybePromptSecret(rl, 'Paste REVENUECAT_API_KEY into this local terminal', 'REVENUECAT_API_KEY');
  if (apiKey) secrets.REVENUECAT_API_KEY = apiKey;
}

async function guideSentryConnector(rl, secrets: Record<string, string>) {
  printSection('Sentry / GlitchTip', [
    'Paste token, org, and base URL. Projects are discovered automatically.',
    'Token page: https://sentry.io/settings/account/api/auth-tokens/',
  ]);
  printBullets([
    'Use read-only API scopes: `org:read`, `project:read`, and `event:read`.',
    'Use `https://sentry.io` for Sentry Cloud or your GlitchTip/self-hosted base URL.',
  ]);

  const accounts = [];
  let index = 0;
  while (true) {
    const baseUrl = await ask(
      rl,
      `Sentry account ${index + 1} base URL`,
      index === 0 ? process.env.SENTRY_BASE_URL || 'https://sentry.io' : 'https://sentry.io',
    );
    const defaultLabel = defaultSentryAccountLabel({ index, baseUrl });
    const label = await ask(rl, `Sentry account ${index + 1} label`, defaultLabel);
    const id = toConfigId(label || baseUrl, `sentry_${index + 1}`);
    const tokenEnv = defaultSentryTokenEnv({ index, label, baseUrl });
    const token = await maybePromptSecret(rl, `Paste ${tokenEnv} into this local terminal`, tokenEnv);
    if (token) secrets[tokenEnv] = token;

    const org = await ask(
      rl,
      `Sentry org slug for ${label} (leave empty to defer)`,
      index === 0 ? process.env.SENTRY_ORG || '' : '',
    );
    const environment = await ask(
      rl,
      `Sentry environment for ${label}`,
      index === 0 ? process.env.SENTRY_ENVIRONMENT || 'production' : 'production',
    );

    let projects = [];
    if (org.trim() && token) {
      process.stdout.write(`Discovering Sentry projects for ${label}...\n`);
      const discovery = await discoverSentryProjects({ baseUrl, token, org });
      if (discovery.ok && discovery.projects.length > 0) {
        projects = discovery.projects;
        process.stdout.write(
          `Configured ${projects.length} project(s): ${projects.slice(0, 8).join(', ')}${projects.length > 8 ? ', ...' : ''}\n`,
        );
      } else {
        process.stdout.write(`Could not discover projects automatically (${discovery.detail}).\n`);
        const manualProjects = parseCommaList(await ask(rl, `Project slugs for ${label} (comma-separated, leave empty to let app context decide)`, ''));
        projects = manualProjects;
      }
    } else {
      process.stdout.write('Project discovery needs both a token and org slug. Project scope will be resolved from app context later.\n');
    }

    accounts.push({
      id,
      label,
      baseUrl,
      tokenEnv,
      ...(org.trim() ? { org: org.trim() } : {}),
      ...(projects.length > 0 ? { projects } : {}),
      ...(environment.trim() ? { environment: environment.trim() } : {}),
    });

    if (index === 0) {
      if (tokenEnv === 'SENTRY_AUTH_TOKEN' && token) secrets.SENTRY_AUTH_TOKEN = token;
      if (org.trim()) secrets.SENTRY_ORG = org.trim();
      if (environment.trim()) secrets.SENTRY_ENVIRONMENT = environment.trim();
      if (baseUrl.trim() && baseUrl.trim() !== 'https://sentry.io') secrets.SENTRY_BASE_URL = baseUrl.trim();
    }

    const addAnother = await askYesNo(
      rl,
      'Configure another Sentry-compatible account now, for example on another base URL?',
      false,
    );
    if (!addAnother) break;
    index += 1;
  }

  return accounts;
}

async function guideAscConnector(rl, secrets: Record<string, string>) {
  printSection('App Store Connect CLI', [
    'Use this mainly for App Store analytics, plus builds, TestFlight, reviews, ratings, and store context.',
    'ASC web analytics also needs a website login; this wizard verifies it after helper setup.',
  ]);
  process.stdout.write('Create an App Store Connect API key here:\n  https://appstoreconnect.apple.com/access/integrations/api\n\n');
  process.stdout.write('Roles to choose for this key:\n');
  printBullets([
    'Required: Sales, for App Analytics, Sales and Trends, downloads, revenue, and conversion context.',
    'Recommended: Customer Support, for App Store ratings and review text.',
    'Recommended: Developer, for builds, TestFlight, and delivery status.',
    'Optional: App Manager, only if OpenClaw should also read or manage app metadata, pricing, or release settings.',
    'Avoid: Admin unless a one-off App Store Connect permission requires it.',
  ]);
  process.stdout.write('\nAfter creating the key, copy these values into this wizard:\n');
  printBullets([
    'Issuer ID from the API keys page.',
    'Key ID from the API key row or from the downloaded file name: AuthKey_<KEY_ID>.p8.',
    'Download the .p8 file, open it, then paste the full file content into this terminal.',
    'If the .p8 is already on this host, leave the content prompt empty and paste the file path instead.',
  ]);

  const keyId = await ask(rl, 'ASC_KEY_ID (leave empty to skip)', process.env.ASC_KEY_ID || '');
  const issuerId = await ask(rl, 'ASC_ISSUER_ID (leave empty to skip)', process.env.ASC_ISSUER_ID || '');
  if (keyId.trim()) secrets.ASC_KEY_ID = keyId.trim();
  if (issuerId.trim()) secrets.ASC_ISSUER_ID = issuerId.trim();

  const privateKeyContent = await askAscPrivateKeyContent(rl);
  if (privateKeyContent) {
    const privateKeyPath = resolveAscPrivateKeyPath(keyId);
    await fs.mkdir(path.dirname(privateKeyPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(privateKeyPath, privateKeyContent, { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(privateKeyPath, 0o600);
    secrets.ASC_PRIVATE_KEY_PATH = privateKeyPath;
    process.stdout.write(`Saved ASC private key to ${privateKeyPath} with chmod 600.\n`);
  } else {
    const privateKeyPath = await askAscPrivateKeyPath(rl);
    if (privateKeyPath.trim()) secrets.ASC_PRIVATE_KEY_PATH = privateKeyPath.trim();
  }
}

async function runConnectorSetupWizard(args) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Connector wizard requires an interactive terminal.');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const existingFixes = await offerConfiguredConnectionFixes(rl, args.config, []);
    const requestedConnectors = args.connectors ? parseConnectorList(args.connectors) : [];
    let selected = withMissingRequiredAnalyticsConnector(
      orderConnectors([
        ...new Set(
          requestedConnectors.length > 0 || existingFixes.length > 0
            ? [...requestedConnectors, ...existingFixes]
            : await askConnectorSelection(rl),
        ),
      ]),
    );
    if (selected.length === 0) {
      throw new Error('No supported connectors selected. Use analytics, github, revenuecat, sentry, asc, or all.');
    }

    clearTerminal();
    printConnectorIntro();
    process.stdout.write(`${ANSI.bold}Selected connectors${ANSI.reset}\n`);
    for (const key of selected) {
      process.stdout.write(`  - ${connectorLabel(key)}\n`);
    }
    process.stdout.write('\n');

    const secrets: Record<string, string> = {};
    let sentryAccounts: any[] = [];
    if (selected.includes('analytics')) {
      clearTerminal();
      await guideAnalyticsConnector(rl, secrets);
    }
    if (selected.includes('github')) {
      clearTerminal();
      await guideGitHubConnector(rl, secrets);
    }
    if (selected.includes('revenuecat')) {
      clearTerminal();
      await guideRevenueCatConnector(rl, secrets);
    }
    if (selected.includes('sentry')) {
      clearTerminal();
      sentryAccounts = await guideSentryConnector(rl, secrets);
    }
    if (selected.includes('asc')) {
      clearTerminal();
      await guideAscConnector(rl, secrets);
    }

    const secretsFile = resolveSecretsFile();
    const wroteSecrets = Object.keys(secrets).length > 0;
    clearTerminal();
    if (wroteSecrets) {
      await writeSecretsFile(secretsFile, secrets);
      process.stdout.write(`\nSaved local secrets to ${secretsFile} with chmod 600.\n`);
    } else {
      process.stdout.write('\nNo new secrets were written.\n');
    }

    if (sentryAccounts.length > 0 && await upsertSentryAccountsConfig(args.config, sentryAccounts)) {
      process.stdout.write(`Configured ${sentryAccounts.length} Sentry-compatible account(s) in ${args.config}.\n`);
    }

    const env = {
      ...process.env,
      ...secrets,
    };
    let command = `node scripts/openclaw-growth-start.mjs --config ${quote(args.config)} --setup-only --connectors ${quote(selected.join(','))}`;
    process.stdout.write('\nTesting connector setup...\n');
    let setupResult = await runCommandCapture(command, { env });
    let setupPayload = parseJsonFromStdout(setupResult.stdout);

    if (setupPayload?.needsUserInput && setupPayload.phase === 'analytics_project_selection_required') {
      const projectId = await askAnalyticsProjectFromSetupPayload(rl, setupPayload);
      if (projectId) {
        command = `${command} --project ${quote(projectId)}`;
        process.stdout.write('\nTesting connector setup with the selected AnalyticsCLI project...\n');
        setupResult = await runCommandCapture(command, { env });
        setupPayload = parseJsonFromStdout(setupResult.stdout);
      }
    }

    if (sentryAccounts.length > 0 && await upsertSentryAccountsConfig(args.config, sentryAccounts)) {
      process.stdout.write(`Sentry-compatible account config is up to date in ${args.config}.\n`);
    }

    if (setupResult.ok && setupPayload?.ok !== false) {
      if (selected.includes('asc')) {
        await ensureAscWebAnalyticsAuth();
      }
      printSetupSuccess(setupPayload);
      if (wroteSecrets) {
        process.stdout.write('Future OpenClaw Growth commands load this secrets file automatically.\n');
      }
      return;
    }

    printSetupFailure({ result: setupResult, payload: setupPayload, command });
    process.exitCode = 1;
  } finally {
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
    if (!answer) return defaultYes;
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
  }
}

async function askChoice(rl, label, options, defaultValue) {
  const normalizedDefault = options.includes(defaultValue) ? defaultValue : options[0];
  while (true) {
    const answer = (
      await rl.question(`${label} (${options.join('/')}) [${normalizedDefault}]: `)
    )
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

async function askSourceConfig(rl, sourceName, defaultPath, hint, options: Record<string, any> = {}) {
  const forceEnabled = Boolean(options.forceEnabled);
  const defaultCommand = String(options.defaultCommand || getDefaultSourceCommand(sourceName) || '').trim();
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
  const value = await ask(
    rl,
    mode === 'file' ? `${sourceName} JSON file path` : `${sourceName} command`,
    mode === 'file' ? defaultPath : defaultCommand,
  );

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
  await loadOpenClawGrowthSecrets();
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

    const detectedRepo = await detectGitHubRepo();
    const githubRepo = await ask(
      rl,
      'GitHub repo (owner/name, optional; leave empty to infer later)',
      detectedRepo || '',
    );
    const labelsRaw = await ask(rl, 'Issue labels (comma-separated)', 'ai-growth,autogenerated,product');
    const labels = labelsRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const maxIssues = Number.parseInt(await ask(rl, 'Max issues per run', '4'), 10) || 4;
    const intervalMinutes = Number.parseInt(await ask(rl, 'Check interval in minutes', '1440'), 10) || 1440;
    const actionMode = await askChoice(
      rl,
      'Preferred GitHub output',
      ['issue', 'pull_request'],
      'issue',
    );

    const analytics = await askSourceConfig(
      rl,
      'analytics',
      'data/openclaw-growth-engineer/analytics_summary.example.json',
      getDefaultSourceHint('analytics'),
      {
        forceEnabled: true,
        defaultCommand: getDefaultSourceCommand('analytics'),
      },
    );
    const revenuecat = await askSourceConfig(
      rl,
      'revenuecat',
      'data/openclaw-growth-engineer/revenuecat_summary.example.json',
      getDefaultSourceHint('revenuecat'),
    );
    const sentry = await askSourceConfig(
      rl,
      'sentry',
      'data/openclaw-growth-engineer/sentry_summary.example.json',
      getDefaultSourceHint('sentry'),
    );
    const feedback = await askSourceConfig(
      rl,
      'feedback',
      'data/openclaw-growth-engineer/feedback_summary.example.json',
      getDefaultSourceHint('feedback'),
      {
        defaultEnabled: true,
        defaultCommand: getDefaultSourceCommand('feedback'),
        cursorMode: 'auto_since_last_fetch',
        initialLookback: '30d',
      },
    );
    const extraSourcesRaw = await ask(
      rl,
      'Extra connectors (comma-separated, e.g. firebase-crashlytics,app-store-reviews,play-console)',
      '',
    );
    const extraSources = extraSourcesRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((service) => {
        const defaultCommand = getDefaultSourceCommand(service);
        return buildExtraSourceConfig(service, defaultCommand ? {} : { mode: 'file', path: getDefaultSourcePath(service) });
      });

    const autoCreateIssues =
      actionMode === 'issue'
        ? await askYesNo(rl, 'Create GitHub issues automatically when new ideas are found?', false)
        : false;
    const autoCreatePullRequests =
      actionMode === 'pull_request'
        ? await askYesNo(
            rl,
            'Create draft pull requests with implementation proposal files automatically?',
            false,
          )
        : false;
    const enableCharting = await askYesNo(
      rl,
      'Generate matplotlib charts from analytics signals and include them in generated GitHub artifacts?',
      false,
    );
    const chartCommand = enableCharting
      ? await ask(
          rl,
          'Optional chart command override (leave empty for default python script)',
          '',
        )
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
      process.stdout.write(
        `2) Fill each extra connector under \`sources.extra[]\` with the final file path or command and optional \`secretEnv\`\n`,
      );
      process.stdout.write(
        `3) Run once: node scripts/openclaw-growth-runner.mjs --config ${configPath}\n`,
      );
      process.stdout.write(
        `4) Run interval loop: node scripts/openclaw-growth-runner.mjs --config ${configPath} --loop\n`,
      );
      return;
    }
    process.stdout.write(`2) Run once: node scripts/openclaw-growth-runner.mjs --config ${configPath}\n`);
    process.stdout.write(
      `3) Run interval loop: node scripts/openclaw-growth-runner.mjs --config ${configPath} --loop\n`,
    );
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
