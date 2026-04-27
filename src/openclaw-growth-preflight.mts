#!/usr/bin/env node

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import {
  classifyServiceKind,
  getActionMode,
  getAllSourceEntries,
  getDefaultSourceCommand,
  getGitHubActionNoun,
  getGitHubConnectionSummary,
  getGitHubRequirementText,
  shouldAutoCreateGitHubArtifact,
} from './openclaw-growth-shared.mjs';

const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;
const ANALYTICSCLI_PACKAGE_SPEC = process.env.ANALYTICSCLI_CLI_PACKAGE || '@analyticscli/cli@preview';
const ANALYTICSCLI_NPM_PREFIX =
  process.env.ANALYTICSCLI_NPM_PREFIX ||
  (process.env.HOME ? path.join(process.env.HOME, '.local') : path.join(process.cwd(), '.analyticscli-npm'));

type ShellResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

function printHelpAndExit(exitCode, reason = null) {
  if (reason) {
    process.stderr.write(`${reason}\n\n`);
  }
  process.stdout.write(`
OpenClaw Growth Preflight

Validates local dependencies, configured sources, and required secrets.

Usage:
  node scripts/openclaw-growth-preflight.mjs [options]

Options:
  --config <file>        Config path (default: ${DEFAULT_CONFIG_PATH})
  --test-connections     Run live API/connector smoke checks for enabled channels
  --timeout-ms <ms>      Connection test timeout in milliseconds (default: ${DEFAULT_CONNECTION_TIMEOUT_MS})
  --json                 Print JSON only (default)
  --help, -h             Show help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG_PATH,
    json: true,
    testConnections: false,
    timeoutMs: DEFAULT_CONNECTION_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === '--') {
      continue;
    } else if (token === '--config') {
      args.config = next || args.config;
      i += 1;
    } else if (token === '--test-connections') {
      args.testConnections = true;
    } else if (token === '--timeout-ms') {
      const parsed = Number.parseInt(String(next || ''), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        printHelpAndExit(1, `Invalid value for --timeout-ms: ${String(next || '')}`);
      }
      args.timeoutMs = parsed;
      i += 1;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
      printHelpAndExit(1, `Unknown argument: ${token}`);
    }
  }

  return args;
}

function shellQuote(value) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(String(value))) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveShellCommand(): string {
  const candidates = [
    process.env.OPENCLAW_SHELL,
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/sh',
    '/usr/bin/sh',
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'sh';
}

function runShell(command): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(resolveShellCommand(), ['-c', command], {
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

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

async function commandExists(commandName) {
  const result = await runShell(`command -v ${shellQuote(commandName)} >/dev/null 2>&1`);
  return result.ok;
}

async function resolveCommandPath(commandName) {
  const result = await runShell(`command -v ${shellQuote(commandName)}`);
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
  const profiles = ['.profile', '.bashrc', '.bash_profile', '.zshrc', '.zprofile'].map((name) =>
    path.join(process.env.HOME!, name),
  );
  let wrote = false;

  for (const profile of profiles) {
    let current = '';
    try {
      current = await fs.readFile(profile, 'utf8');
    } catch {
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
      command:
        'for f in "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
    },
    {
      shell: '/usr/bin/bash',
      command:
        'for f in "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
    },
    {
      shell: '/bin/zsh',
      command:
        'for f in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
    },
    {
      shell: '/usr/bin/zsh',
      command:
        'for f in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.profile"; do [[ -f "$f" ]] && source "$f" >/dev/null 2>&1 || true; done; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
    },
    {
      shell: '/bin/sh',
      command:
        '[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1 || true; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
    },
    {
      shell: '/usr/bin/sh',
      command:
        '[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1 || true; command -v analyticscli >/dev/null 2>&1 && analyticscli --help >/dev/null 2>&1',
    },
  ];

  for (const probe of probes) {
    if (!(await fileExists(probe.shell))) {
      continue;
    }
    const result = await runShell(
      `env HOME=${shellQuote(process.env.HOME)} PATH=${shellQuote(cleanPath)} ${shellQuote(probe.shell)} -lc ${shellQuote(probe.command)}`,
    );
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
    return beforePath
      ? {
          ok: true,
          detail: `analyticscli binary found at ${beforePath}; npm unavailable, so package update was skipped`,
        }
      : {
          ok: false,
          detail: `analyticscli binary missing and npm is unavailable; install ${ANALYTICSCLI_PACKAGE_SPEC}`,
        };
  }

  const globalInstall = await runShell(`npm install -g ${shellQuote(ANALYTICSCLI_PACKAGE_SPEC)}`);
  if (!globalInstall.ok) {
    const installOutput = `${globalInstall.stderr}\n${globalInstall.stdout}`;
    if (isPermissionFailure(installOutput)) {
      await fs.mkdir(ANALYTICSCLI_NPM_PREFIX, { recursive: true });
      const localInstall = await runShell(
        `npm install -g --prefix ${shellQuote(ANALYTICSCLI_NPM_PREFIX)} ${shellQuote(ANALYTICSCLI_PACKAGE_SPEC)}`,
      );
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
    } else {
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
    const helpCheck = await runShell('analyticscli --help >/dev/null 2>&1');
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

function parseCommandHead(command) {
  if (!command || typeof command !== 'string') return null;
  const trimmed = command.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[0] : null;
}

function isPortableCommandDefault(sourceName, command) {
  const expected = getDefaultSourceCommand(sourceName);
  if (!expected) return false;
  return String(command || '').trim().startsWith(expected);
}

function truncate(value, max = 240) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

async function readJson(filePath): Promise<any> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function addCheck(checks, name, ok, detail, severity = 'fail') {
  checks.push({
    name,
    status: ok ? 'pass' : severity,
    detail,
  });
}

function getSecretName(config, key, fallback) {
  const value = config?.secrets?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sourceEnabled(config, sourceName) {
  return Boolean(config?.sources?.[sourceName] && config.sources[sourceName].enabled !== false);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function testAnalyticsConnection(analyticsToken) {
  const hasCli = await commandExists('analyticscli');
  if (!hasCli) {
    return {
      ok: false,
      detail: 'analyticscli binary missing',
    };
  }

  const command = analyticsToken
    ? `analyticscli --access-token ${shellQuote(analyticsToken)} projects list`
    : 'analyticscli projects list';
  const result = await runShell(command);
  if (!result.ok) {
    return {
      ok: false,
      detail: truncate(result.stderr || `exit ${result.code}`),
    };
  }

  return {
    ok: true,
    detail: analyticsToken
      ? 'analyticscli token auth check passed (`projects list`)'
      : 'analyticscli auth check passed (`projects list`)',
  };
}

async function testRevenueCatConnection(revenuecatToken, timeoutMs) {
  if (!revenuecatToken) {
    return {
      ok: false,
      detail: 'missing token',
    };
  }
  try {
    const response = await fetchWithTimeout(
      'https://api.revenuecat.com/v2/projects?limit=1',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${revenuecatToken}`,
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      return {
        ok: false,
        detail: `HTTP ${response.status}: ${truncate(response.body)}`,
      };
    }
    return {
      ok: true,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function describeAnalyticsConnectionFailure(detail, analyticsTokenEnv, hasAnalyticsToken) {
  if (!hasAnalyticsToken) {
    return `Nearly done: I only need \`${analyticsTokenEnv}\` from you to continue setup. Create or copy an AnalyticsCLI access token in dash.analyticscli.com -> API Keys, then run \`analyticscli --api-url https://api.analyticscli.com login --access-token <access_token>\` or set \`${analyticsTokenEnv}\`. Raw error: ${detail}`;
  }

  return `AnalyticsCLI connection failed with \`${analyticsTokenEnv}\` set. Verify the token, selected project, and \`ANALYTICSCLI_API_URL=https://api.analyticscli.com\`. Raw error: ${detail}`;
}

async function testSentryConnection(sentryToken, timeoutMs) {
  if (!sentryToken) {
    return {
      ok: false,
      detail: 'missing token',
    };
  }
  try {
    const response = await fetchWithTimeout(
      'https://sentry.io/api/0/organizations/',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${sentryToken}`,
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      return {
        ok: false,
        detail: `HTTP ${response.status}: ${truncate(response.body)}`,
      };
    }
    return {
      ok: true,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testGitHubConnection(githubToken, githubRepo, timeoutMs, actionMode) {
  if (!githubToken) {
    return {
      ok: false,
      detail: 'missing token',
    };
  }
  try {
    const response = await fetchWithTimeout(
      'https://api.github.com/user',
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      return {
        ok: false,
        detail: `HTTP ${response.status}: ${truncate(response.body)}`,
      };
    }

    const repo = String(githubRepo || '').trim();
    if (!repo) {
      return {
        ok: false,
        detail: 'project.githubRepo is missing',
      };
    }

    const repoResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${repo}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
        },
      },
      timeoutMs,
    );
    if (!repoResponse.ok) {
      return {
        ok: false,
        detail: `repo access check failed (HTTP ${repoResponse.status}: ${truncate(repoResponse.body)})`,
      };
    }

    const artifactPath =
      actionMode === 'pull_request'
        ? `pulls?state=all&per_page=1`
        : `issues?state=all&per_page=1`;
    const artifactsResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${repo}/${artifactPath}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
        },
      },
      timeoutMs,
    );
    if (!artifactsResponse.ok) {
      return {
        ok: false,
        detail: `${getGitHubActionNoun(actionMode)} API check failed (HTTP ${artifactsResponse.status}: ${truncate(artifactsResponse.body)})`,
      };
    }

    return {
      ok: true,
      detail: `${getGitHubConnectionSummary(actionMode)} (${getGitHubRequirementText(actionMode)})`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testCommandSourceJson(command) {
  const result = await runShell(command);
  if (!result.ok) {
    return {
      ok: false,
      detail: truncate(result.stderr || `exit ${result.code}`),
    };
  }

  try {
    JSON.parse(result.stdout);
  } catch {
    return {
      ok: false,
      detail: 'command succeeded but returned non-JSON output',
    };
  }
  return {
    ok: true,
    detail: 'command returned JSON',
  };
}

async function runConnectionChecks({ checks, config, timeoutMs }) {
  const analyticsTokenEnv = getSecretName(config, 'analyticsTokenEnv', 'ANALYTICSCLI_ACCESS_TOKEN');
  const revenuecatTokenEnv = getSecretName(config, 'revenuecatTokenEnv', 'REVENUECAT_API_KEY');
  const sentryTokenEnv = getSecretName(config, 'sentryTokenEnv', 'SENTRY_AUTH_TOKEN');
  const feedbackTokenEnv = getSecretName(config, 'feedbackTokenEnv', 'FEEDBACK_API_TOKEN');
  const githubTokenEnv = getSecretName(config, 'githubTokenEnv', 'GITHUB_TOKEN');
  const githubRepo = String(config?.project?.githubRepo || '').trim();
  const actionMode = getActionMode(config);
  const requiresGitHubDelivery = shouldAutoCreateGitHubArtifact(config);

  const analyticsSource = config.sources?.analytics;
  if (sourceEnabled(config, 'analytics')) {
    const analyticsToken = process.env[analyticsTokenEnv] || process.env.ANALYTICSCLI_ACCESS_TOKEN || '';
    const hasAnalyticsToken = Boolean(analyticsToken);
    const analyticsConnection = await testAnalyticsConnection(analyticsToken);
    addCheck(
      checks,
      'connection:analytics',
      analyticsConnection.ok,
      analyticsConnection.ok
        ? analyticsConnection.detail
        : describeAnalyticsConnectionFailure(analyticsConnection.detail, analyticsTokenEnv, hasAnalyticsToken),
      analyticsConnection.ok ? 'pass' : analyticsSource?.mode === 'command' ? 'fail' : 'warn',
    );

    if (analyticsSource?.mode === 'command') {
      const command = String(analyticsSource.command || '').trim();
      if (!command) {
        addCheck(checks, 'connection:analytics-command', false, 'analytics source uses command mode but no command configured');
      } else {
        const commandCheck = await testCommandSourceJson(command);
        addCheck(
          checks,
          'connection:analytics-command',
          commandCheck.ok,
          commandCheck.ok
            ? 'analytics command smoke test passed'
            : `analytics command smoke test failed (${commandCheck.detail})`,
        );
      }
    }
  } else {
    addCheck(checks, 'connection:analytics', true, 'source disabled');
  }

  const revenuecatSource = config.sources?.revenuecat;
  if (sourceEnabled(config, 'revenuecat')) {
    const token = process.env[revenuecatTokenEnv] || '';
    if (!token) {
      addCheck(
        checks,
        `connection:revenuecat`,
        false,
        `${revenuecatTokenEnv} missing (required for live RevenueCat API test)`,
        revenuecatSource?.mode === 'command' ? 'fail' : 'warn',
      );
    } else {
      const revenuecatConnection = await testRevenueCatConnection(token, timeoutMs);
      addCheck(
        checks,
        'connection:revenuecat',
        revenuecatConnection.ok,
        revenuecatConnection.ok
          ? `RevenueCat auth check passed (${revenuecatConnection.detail})`
          : `RevenueCat auth check failed (${revenuecatConnection.detail})`,
      );
    }
  } else {
    addCheck(checks, 'connection:revenuecat', true, 'source disabled');
  }

  const sentrySource = config.sources?.sentry;
  if (sourceEnabled(config, 'sentry')) {
    const token = process.env[sentryTokenEnv] || '';
    if (!token) {
      addCheck(
        checks,
        `connection:sentry`,
        false,
        `${sentryTokenEnv} missing (required for live Sentry API test)`,
        sentrySource?.mode === 'command' ? 'fail' : 'warn',
      );
    } else {
      const sentryConnection = await testSentryConnection(token, timeoutMs);
      addCheck(
        checks,
        'connection:sentry',
        sentryConnection.ok,
        sentryConnection.ok
          ? `Sentry auth check passed (${sentryConnection.detail})`
          : `Sentry auth check failed (${sentryConnection.detail})`,
      );
    }
  } else {
    addCheck(checks, 'connection:sentry', true, 'source disabled');
  }

  const feedbackSource = config.sources?.feedback;
  if (sourceEnabled(config, 'feedback') && feedbackSource?.mode === 'command') {
    const command = String(feedbackSource.command || '').trim();
    if (!command) {
      addCheck(checks, 'connection:feedback', false, 'feedback source uses command mode but no command configured');
    } else {
      const feedbackConnection = await testCommandSourceJson(command);
      addCheck(
        checks,
        'connection:feedback',
        feedbackConnection.ok,
        feedbackConnection.ok
          ? 'Feedback command smoke test passed'
          : `Feedback command smoke test failed (${feedbackConnection.detail})`,
      );
    }
  } else if (sourceEnabled(config, 'feedback')) {
    if (process.env[feedbackTokenEnv]) {
      addCheck(
        checks,
        'connection:feedback',
        true,
        'source in file mode; FEEDBACK_API_TOKEN is present',
      );
    } else {
      addCheck(
        checks,
        'connection:feedback',
        true,
        'source in file mode (no direct API smoke test required)',
      );
    }
  } else {
    addCheck(checks, 'connection:feedback', true, 'source disabled');
  }

  for (const extraSource of getAllSourceEntries(config).filter((source) => !source.builtIn)) {
    const serviceKind = classifyServiceKind(extraSource.service || extraSource.key);
    const checkName = `connection:${extraSource.key}`;
    if (extraSource.enabled === false) {
      addCheck(checks, checkName, true, 'source disabled');
      continue;
    }

    if (extraSource.mode === 'command') {
      const command = String(extraSource.command || '').trim();
      if (!command) {
        addCheck(checks, checkName, false, 'source uses command mode but no command configured');
        continue;
      }
      const commandCheck = await testCommandSourceJson(command);
      addCheck(
        checks,
        checkName,
        commandCheck.ok,
        commandCheck.ok
          ? `${extraSource.key} command smoke test passed`
          : `${extraSource.key} command smoke test failed (${commandCheck.detail})`,
      );
      continue;
    }

    if (extraSource.secretEnv) {
      const hasSecret = Boolean(process.env[extraSource.secretEnv]);
      addCheck(
        checks,
        checkName,
        hasSecret || serviceKind === 'feedback',
        hasSecret
          ? `${extraSource.secretEnv} set`
          : serviceKind === 'feedback'
            ? 'file mode without direct API test'
            : `${extraSource.secretEnv} not set (required for this extra connector)`,
        hasSecret || serviceKind === 'feedback' ? 'pass' : 'warn',
      );
      continue;
    }

    addCheck(checks, checkName, true, 'file mode (no live API smoke test configured)');
  }

  const githubToken = process.env[githubTokenEnv] || '';
  const githubCheckName =
    actionMode === 'pull_request' ? 'connection:github-pull-requests' : 'connection:github';
  if (!requiresGitHubDelivery) {
    addCheck(
      checks,
      githubCheckName,
      true,
      'skipped because GitHub artifact creation is disabled',
    );
  } else if (!githubToken) {
    addCheck(
      checks,
      githubCheckName,
      false,
      `${githubTokenEnv} missing (required; ${getGitHubRequirementText(actionMode)})`,
    );
  } else {
    const githubConnection = await testGitHubConnection(githubToken, githubRepo, timeoutMs, actionMode);
    addCheck(
      checks,
      githubCheckName,
      githubConnection.ok,
      githubConnection.ok
        ? `GitHub auth check passed (${githubConnection.detail})`
        : `GitHub auth check failed (${githubConnection.detail})`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config);
  const checks = [];

  addCheck(checks, 'node-runtime', true, `Node ${process.version}`);

  let config = null;
  try {
    config = await readJson(configPath);
    addCheck(checks, 'config-file', true, `Loaded ${configPath}`);
  } catch (error) {
    addCheck(
      checks,
      'config-file',
      false,
      `Could not read config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (config) {
    const actionMode = getActionMode(config);
    const requiresGitHubDelivery = shouldAutoCreateGitHubArtifact(config);
    const analyticsEnabled = sourceEnabled(config, 'analytics');
    addCheck(
      checks,
      'source:analytics:required',
      analyticsEnabled,
      analyticsEnabled ? 'enabled' : 'analytics source is required and cannot be disabled',
    );

    const analyticscliEnsure = await ensureAnalyticsCliInstalled();
    addCheck(
      checks,
      'dependency:analyticscli',
      analyticscliEnsure.ok,
      analyticscliEnsure.detail,
    );

    const githubRepo = String(config.project?.githubRepo || '').trim();
    addCheck(
      checks,
      'project:github-repo',
      Boolean(githubRepo) || !requiresGitHubDelivery,
      githubRepo
        ? `configured (${githubRepo})`
        : requiresGitHubDelivery
          ? 'project.githubRepo is required'
          : 'not configured (optional when GitHub delivery is disabled)',
      requiresGitHubDelivery ? 'fail' : 'warn',
    );

    const githubTokenEnv = getSecretName(config, 'githubTokenEnv', 'GITHUB_TOKEN');
    const hasGithubToken = Boolean(process.env[githubTokenEnv]);
    addCheck(
      checks,
      `secret:${githubTokenEnv}`,
      hasGithubToken || !requiresGitHubDelivery,
      hasGithubToken
        ? requiresGitHubDelivery
          ? `set (required; ${getGitHubRequirementText(actionMode)})`
          : 'set (optional when GitHub delivery is disabled)'
        : requiresGitHubDelivery
          ? `missing (required; ${getGitHubRequirementText(actionMode)})`
          : 'optional when GitHub delivery is disabled',
      requiresGitHubDelivery ? 'fail' : 'warn',
    );

    for (const source of getAllSourceEntries(config)) {
      const sourceName = source.key;
      if (!source || source.enabled === false) {
        addCheck(
          checks,
          `source:${sourceName}`,
          sourceName !== 'analytics',
          sourceName === 'analytics' ? 'disabled (not allowed)' : 'disabled',
        );
        continue;
      }

      if (source.mode === 'file') {
        const sourcePath = source.path ? path.resolve(String(source.path)) : null;
        if (!sourcePath) {
          addCheck(checks, `source:${sourceName}:file`, false, 'mode=file but no path configured');
          continue;
        }
        try {
          await fs.access(sourcePath);
          addCheck(checks, `source:${sourceName}:file`, true, `Found ${sourcePath}`);
        } catch {
          addCheck(checks, `source:${sourceName}:file`, false, `Missing file ${sourcePath}`);
        }
        continue;
      }

      if (source.mode === 'command') {
        const command = String(source.command || '').trim();
        if (!command) {
          addCheck(checks, `source:${sourceName}:command`, false, 'mode=command but no command configured');
          continue;
        }

        const usesPortableDefault = isPortableCommandDefault(sourceName, command);
        addCheck(
          checks,
          `source:${sourceName}:mode`,
          usesPortableDefault,
          usesPortableDefault
            ? 'mode=command configured with built-in portable exporter'
            : 'mode=command configured (allowed, but file mode is the recommended default)',
          'warn',
        );

        const head = parseCommandHead(command);
        if (!head) {
          addCheck(checks, `source:${sourceName}:command`, false, 'Could not parse command head');
          continue;
        }

        const exists = await commandExists(head);
        addCheck(
          checks,
          `source:${sourceName}:command-head`,
          exists,
          exists ? `Found command head: ${head}` : `Missing command head: ${head}`,
        );

        if (sourceName === 'revenuecat') {
          const revenuecatTokenEnv = getSecretName(config, 'revenuecatTokenEnv', 'REVENUECAT_API_KEY');
          const hasRevenuecatToken = Boolean(process.env[revenuecatTokenEnv]);
          addCheck(
            checks,
            `secret:${revenuecatTokenEnv}`,
            hasRevenuecatToken,
            hasRevenuecatToken ? 'set (required for RevenueCat command mode)' : 'missing (required for RevenueCat command mode)',
          );
        }

        if (sourceName === 'sentry') {
          const sentryTokenEnv = getSecretName(config, 'sentryTokenEnv', 'SENTRY_AUTH_TOKEN');
          const hasSentryToken = Boolean(process.env[sentryTokenEnv]);
          addCheck(
            checks,
            `secret:${sentryTokenEnv}`,
            hasSentryToken,
            hasSentryToken ? 'set (required for Sentry command mode)' : 'missing (required for Sentry command mode)',
          );
        }

        if (!source.builtIn && source.secretEnv) {
          const hasConnectorToken = Boolean(process.env[source.secretEnv]);
          addCheck(
            checks,
            `secret:${source.secretEnv}`,
            hasConnectorToken,
            hasConnectorToken
              ? `set (required for ${sourceName} command mode)`
              : `missing (required for ${sourceName} command mode)`,
          );
        }

        continue;
      }

      addCheck(checks, `source:${sourceName}`, false, `Unsupported source mode: ${String(source.mode || 'undefined')}`);
    }

    addCheck(
      checks,
      actionMode === 'pull_request' ? 'github-pull-request-create' : 'github-issue-create',
      actionMode === 'pull_request'
        ? config.actions?.autoCreatePullRequests === true
        : config.actions?.autoCreateIssues === true,
      actionMode === 'pull_request'
        ? config.actions?.autoCreatePullRequests === true
          ? 'enabled'
          : 'disabled by default (drafts only; enable explicitly to create GitHub artifacts)'
        : config.actions?.autoCreateIssues === true
          ? 'enabled'
          : 'disabled by default (drafts only; enable explicitly to create GitHub artifacts)',
      (actionMode === 'pull_request'
        ? config.actions?.autoCreatePullRequests === true
        : config.actions?.autoCreateIssues === true)
        ? 'pass'
        : 'warn',
    );

    if (config.charting?.enabled) {
      const pythonExists = await commandExists('python3');
      addCheck(checks, 'dependency:python3', pythonExists, pythonExists ? 'python3 found' : 'python3 missing');

      if (pythonExists) {
        const matplotlibCheck = await runShell("python3 -c 'import matplotlib'");
        addCheck(
          checks,
          'dependency:matplotlib',
          matplotlibCheck.ok,
          matplotlibCheck.ok ? 'matplotlib import ok' : 'matplotlib missing (install with: python3 -m pip install matplotlib)',
        );
      }
    } else {
      addCheck(checks, 'charting', true, 'disabled');
    }

    if (sourceEnabled(config, 'analytics') && config.sources?.analytics?.mode === 'command') {
      const analyticsTokenEnv = getSecretName(config, 'analyticsTokenEnv', 'ANALYTICSCLI_ACCESS_TOKEN');
      const hasAnalyticsToken = Boolean(process.env[analyticsTokenEnv] || process.env.ANALYTICSCLI_ACCESS_TOKEN);
      addCheck(
        checks,
        `secret:${analyticsTokenEnv}`,
        hasAnalyticsToken,
        hasAnalyticsToken
          ? 'set (optional if analyticscli uses stored login)'
          : `nearly done: set ${analyticsTokenEnv} or run analyticscli login --access-token <access_token>`,
        hasAnalyticsToken ? 'pass' : 'warn',
      );
    }

    if (args.testConnections) {
      await runConnectionChecks({
        checks,
        config,
        timeoutMs: args.timeoutMs,
      });
    }
  }

  const failCount = checks.filter((check) => check.status === 'fail').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  const passCount = checks.filter((check) => check.status === 'pass').length;

  const result = {
    ok: failCount === 0,
    summary: {
      pass: passCount,
      warn: warnCount,
      fail: failCount,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
