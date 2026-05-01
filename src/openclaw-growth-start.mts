#!/usr/bin/env node

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { getActionMode, getDefaultSourceCommand } from './openclaw-growth-shared.mjs';

const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const DEFAULT_TEMPLATE_PATH = 'data/openclaw-growth-engineer/config.example.json';
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
OpenClaw Growth Start

Bootstraps setup and first run in one deterministic flow:
1) Ensure config exists (auto-bootstrap from template when missing)
2) Run preflight
3) If preflight passes, run first pass

Usage:
  node scripts/openclaw-growth-start.mjs [options]

Options:
  --config <file>        Config path (default: ${DEFAULT_CONFIG_PATH})
  --project <id>         AnalyticsCLI project ID to use for generated source commands
  --connectors <list>    Install/enable connector helpers (github,asc,revenuecat,all)
  --setup-only           Run bootstrap + preflight only (skip first run)
  --no-test-connections  Skip live API smoke checks in preflight
  --help, -h             Show help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG_PATH,
    project: '',
    run: true,
    testConnections: true,
    connectors: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--') {
      continue;
    } else if (token === '--config') {
      args.config = next || args.config;
      i += 1;
    } else if (token === '--project') {
      args.project = String(next || '').trim();
      i += 1;
    } else if (token === '--connectors') {
      args.connectors = parseConnectorList(next || '');
      i += 1;
    } else if (token === '--setup-only') {
      args.run = false;
    } else if (token === '--no-test-connections') {
      args.testConnections = false;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
      printHelpAndExit(1, `Unknown argument: ${token}`);
    }
  }

  return args;
}

function normalizeConnectorKey(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (!normalized) return null;
  if (normalized === 'all') return 'all';
  if (['github', 'gh', 'github-code', 'codebase', 'code-access'].includes(normalized)) return 'github';
  if (['asc', 'asc-cli', 'app-store-connect', 'appstoreconnect', 'app-store'].includes(normalized)) return 'asc';
  if (['revenuecat', 'revenue-cat', 'rc', 'revenuecat-mcp'].includes(normalized)) return 'revenuecat';
  return null;
}

function parseConnectorList(value) {
  if (!String(value || '').trim()) return [];

  const connectors = new Set();
  for (const entry of String(value).split(',')) {
    const connector = normalizeConnectorKey(entry);
    if (!connector) {
      printHelpAndExit(1, `Unknown connector: ${entry.trim()}. Use github, asc, revenuecat, or all.`);
    }
    if (connector === 'all') {
      connectors.add('github');
      connectors.add('asc');
      connectors.add('revenuecat');
    } else {
      connectors.add(connector);
    }
  }
  return [...connectors];
}

function quote(value) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(String(value))) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function truncate(value, max = 240) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
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

function runShellCommand(command, timeoutMs = 120_000): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(resolveShellCommand(), ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
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
      if (settled) return;
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
  } catch {
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
    const result = await runShellCommand(
      `env HOME=${quote(process.env.HOME)} PATH=${quote(cleanPath)} ${quote(probe.shell)} -lc ${quote(probe.command)}`,
      30_000,
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
      const localInstall = await runShellCommand(
        `npm install -g --prefix ${quote(ANALYTICSCLI_NPM_PREFIX)} ${quote(ANALYTICSCLI_PACKAGE_SPEC)}`,
        180_000,
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

async function readJson(filePath): Promise<any> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function appendHelperDetail(details, label, result) {
  if (result.ok) {
    details.push(`${label}: ok`);
    return;
  }
  details.push(`${label}: ${truncate(result.stderr || result.stdout || `exit ${result.code ?? 'unknown'}`)}`);
}

async function installClawHubSkill(skillName, details) {
  if (await commandExists('clawhub')) {
    const result = await runShellCommand(`clawhub install ${quote(skillName)} || clawhub install ${quote(skillName)} --force`, 180_000);
    await appendHelperDetail(details, `ClawHub skill ${skillName}`, result);
    return result.ok;
  }
  if (await commandExists('npx')) {
    const result = await runShellCommand(
      `npx -y clawhub install ${quote(skillName)} || npx -y clawhub install ${quote(skillName)} --force`,
      180_000,
    );
    await appendHelperDetail(details, `ClawHub skill ${skillName}`, result);
    return result.ok;
  }
  details.push(`ClawHub skill ${skillName}: skipped because neither clawhub nor npx is available`);
  return false;
}

async function installAgentSkill(repo, details) {
  if (!(await commandExists('npx'))) {
    details.push(`Agent skill ${repo}: skipped because npx is unavailable`);
    return false;
  }
  const result = await runShellCommand(`npx -y skills add ${quote(repo)}`, 180_000);
  await appendHelperDetail(details, `Agent skill ${repo}`, result);
  return result.ok;
}

async function installSystemBinary(commandName, details) {
  if (await commandExists(commandName)) {
    details.push(`${commandName} binary found at ${await resolveCommandPath(commandName)}`);
    return true;
  }

  if (await commandExists('brew')) {
    const result = await runShellCommand(`brew install ${quote(commandName)}`, 600_000);
    await appendHelperDetail(details, `brew install ${commandName}`, result);
  } else if (await commandExists('apt-get')) {
    const prefix = process.getuid?.() === 0 ? '' : 'sudo -n ';
    const result = await runShellCommand(`${prefix}apt-get update && ${prefix}apt-get install -y ${quote(commandName)}`, 600_000);
    await appendHelperDetail(details, `apt-get install ${commandName}`, result);
  } else if (await commandExists('winget')) {
    const packageId = commandName === 'gh' ? 'GitHub.cli' : commandName;
    const result = await runShellCommand(`winget install --id ${quote(packageId)} -e --silent`, 600_000);
    await appendHelperDetail(details, `winget install ${packageId}`, result);
  } else {
    details.push(`No supported non-interactive installer found for ${commandName}`);
  }

  const installedPath = await resolveCommandPath(commandName);
  if (installedPath) {
    details.push(`${commandName} binary found at ${installedPath}`);
    return true;
  }
  return false;
}

function resolveMcpNpmCacheDir() {
  return process.env.OPENCLAW_MCP_NPM_CACHE ||
    (process.env.HOME ? path.join(process.env.HOME, '.cache', 'openclaw-mcp-npm') : path.join(process.cwd(), '.openclaw-mcp-npm-cache'));
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function upsertRevenueCatCodexMcpConfig(apiKey) {
  if (!process.env.HOME) return null;

  const configDir = path.join(process.env.HOME, '.codex');
  const configFile = path.join(configDir, 'config.toml');
  await fs.mkdir(configDir, { recursive: true });
  let existing = '';
  try {
    existing = await fs.readFile(configFile, 'utf8');
  } catch {
    existing = '';
  }
  const block = `[mcp_servers.revenuecat]
command = "npx"
args = ["--yes", "--cache", "${escapeTomlString(resolveMcpNpmCacheDir())}", "mcp-remote", "https://mcp.revenuecat.ai/mcp", "--header", "Authorization: Bearer \${AUTH_TOKEN}"]
env = { AUTH_TOKEN = "${escapeTomlString(apiKey)}" }
type = "stdio"
startup_timeout_ms = 20000
`;
  const pattern = /(?:^|\n)\[mcp_servers\.revenuecat\]\n(?:.*\n)*?(?=\n\[|\s*$)/m;
  const next = pattern.test(existing)
    ? existing.replace(pattern, `${existing.startsWith('[mcp_servers.revenuecat]') ? '' : '\n'}${block}`)
    : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${block}`;
  await fs.writeFile(configFile, `${next.trimEnd()}\n`, 'utf8');
  return configFile;
}

async function installRevenueCatConnector() {
  const details = [];
  if (!(await commandExists('npx'))) {
    return { connector: 'revenuecat', ok: false, detail: 'npx is required for RevenueCat MCP transport but is unavailable' };
  }
  const check = await runShellCommand(`npx --yes --cache ${quote(resolveMcpNpmCacheDir())} mcp-remote`, 120_000);
  const output = `${check.stderr}\n${check.stdout}`;
  const available = check.ok || /Usage: .*mcp-remote|Usage: .*proxy\.ts/i.test(output);
  if (!available) {
    await appendHelperDetail(details, 'npx mcp-remote availability check', check);
    return { connector: 'revenuecat', ok: false, detail: details.join('; ') };
  }
  details.push(`RevenueCat MCP transport mcp-remote is available via npx cache ${resolveMcpNpmCacheDir()}`);
  const apiKey = String(process.env.REVENUECAT_API_KEY || '').trim();
  if (apiKey) {
    const configFile = await upsertRevenueCatCodexMcpConfig(apiKey);
    details.push(configFile ? `RevenueCat MCP configured in ${configFile}` : 'RevenueCat MCP transport available; HOME missing so MCP config was not written');
  } else {
    details.push('Set REVENUECAT_API_KEY, then rerun this command to write the RevenueCat MCP client config');
  }
  return { connector: 'revenuecat', ok: true, detail: details.join('; ') };
}

async function installGitHubConnector() {
  const details = [];
  await installClawHubSkill('github', details);
  const ok = await installSystemBinary('gh', details);
  return { connector: 'github', ok, detail: `${details.join('; ')}${ok ? '; next run gh auth status or gh auth login' : ''}` };
}

async function installAscConnector() {
  const details = [];
  await installAgentSkill('rorkai/app-store-connect-cli-skills', details);
  let ok = await installSystemBinary('asc', details);
  if (!ok && (await commandExists('curl'))) {
    const result = await runShellCommand('curl -fsSL https://asccli.sh/install | bash', 600_000);
    await appendHelperDetail(details, 'asc install script', result);
    ok = Boolean(await resolveCommandPath('asc'));
  }
  return { connector: 'asc', ok, detail: `${details.join('; ')}${ok ? '; next run asc auth status --validate or asc auth login' : ''}` };
}

async function enableConnectorConfig(configPath, connectors) {
  if (connectors.length === 0 || !(await fileExists(configPath))) return;
  const config = await readJson(configPath);
  const extra = Array.isArray(config.sources?.extra) ? config.sources.extra : [];
  const next = {
    ...config,
    sources: {
      ...(config.sources || {}),
      revenuecat: connectors.includes('revenuecat')
        ? { ...(config.sources?.revenuecat || {}), enabled: true }
        : config.sources?.revenuecat,
      extra: extra.map((source) =>
        connectors.includes('asc') && source?.service === 'asc-cli'
          ? { ...source, enabled: true, mode: 'command', command: source.command || getDefaultSourceCommand('asc') }
          : source,
      ),
    },
  };
  await writeJson(configPath, next);
}

async function installConnectorHelpers(configPath, connectors) {
  await enableConnectorConfig(configPath, connectors);
  const results = [];
  for (const connector of connectors) {
    if (connector === 'github') results.push(await installGitHubConnector());
    if (connector === 'asc') results.push(await installAscConnector());
    if (connector === 'revenuecat') results.push(await installRevenueCatConnector());
  }
  return results;
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

async function detectGitHubRepo() {
  const explicit = String(process.env.OPENCLAW_GITHUB_REPO || '').trim();
  if (explicit) return explicit;

  const remoteResult = await runShellCommand('git config --get remote.origin.url', 10_000);
  if (!remoteResult.ok) return null;
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
  if (!raw) return null;
  const firstBrace = raw.indexOf('{');
  if (firstBrace < 0) return null;
  try {
    return JSON.parse(raw.slice(firstBrace));
  } catch {
    return null;
  }
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractProjectChoices(payload) {
  const candidates = (() => {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.projects)) return payload.projects;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.data)) return payload.data;
    }
    return [];
  })();

  const byId = new Map();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id =
      normalizeString(candidate.id) ||
      normalizeString(candidate.projectId) ||
      normalizeString(candidate.project_id);
    if (!id) continue;
    const name = normalizeString(candidate.name) || normalizeString(candidate.displayName);
    const slug = normalizeString(candidate.slug);
    byId.set(id, {
      id,
      name,
      slug,
      label: name || slug || id,
    });
  }

  return [...byId.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function isMissingProjectSelection(text) {
  return /Project ID is missing|Pass --project <id>|analyticscli projects select/i.test(String(text || ''));
}

function commandHasProjectFlag(command) {
  return /(^|\s)--project(\s|=|$)/.test(String(command || ''));
}

function appendProjectFlag(command, projectId) {
  const raw = String(command || '').trim();
  if (!raw || commandHasProjectFlag(raw)) return raw;
  return `${raw} --project ${quote(projectId)}`;
}

async function configureAnalyticsProject(configPath, projectId) {
  const normalizedProjectId = normalizeString(projectId);
  if (!normalizedProjectId) return false;

  const config = await readJson(configPath);
  let changed = false;
  for (const sourceName of ['analytics', 'feedback']) {
    const source = config?.sources?.[sourceName];
    if (!source || source.enabled === false || source.mode !== 'command' || !source.command) {
      continue;
    }
    const nextCommand = appendProjectFlag(source.command, normalizedProjectId);
    if (nextCommand !== source.command) {
      source.command = nextCommand;
      changed = true;
    }
  }

  if (!config.project || typeof config.project !== 'object') {
    config.project = {};
  }
  if (config.project.analyticsProjectId !== normalizedProjectId) {
    config.project.analyticsProjectId = normalizedProjectId;
    changed = true;
  }

  if (changed) {
    await writeJson(configPath, config);
  }
  return changed;
}

async function listAnalyticsProjects() {
  const result = await runShellCommand('analyticscli projects list --format json', 60_000);
  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || `exit ${result.code}`,
      projects: [],
    };
  }
  const payload = parseJsonFromStdout(result.stdout);
  return {
    ok: true,
    error: null,
    projects: extractProjectChoices(payload),
  };
}

async function buildProjectSelectionResponse({ configCreated, configPath, projectConfigured, rawError }) {
  const projectList = await listAnalyticsProjects();
  const projects = projectList.projects;
  const singleProject = projects.length === 1 ? projects[0] : null;
  return {
    ok: true,
    phase: 'project_selection_required',
    setupComplete: false,
    configCreated,
    configPath,
    projectConfigured,
    needsUserInput: true,
    question:
      projects.length > 1
        ? 'Which AnalyticsCLI project should OpenClaw use for this setup?'
        : 'Which AnalyticsCLI project should OpenClaw use for this setup?',
    message:
      projects.length > 1
        ? 'Multiple AnalyticsCLI projects are available. Ask the user which project to use, then persist it and retry the run.'
        : singleProject
          ? 'One AnalyticsCLI project is available. Persist it as the default project and retry the run.'
          : 'AnalyticsCLI needs a selected project before the first run can query analytics.',
    projects,
    suggestedProjectId: singleProject?.id || null,
    nextCommand:
      singleProject
        ? `node scripts/openclaw-growth-start.mjs --config ${quote(configPath)} --project ${quote(singleProject.id)}`
        : `node scripts/openclaw-growth-start.mjs --config ${quote(configPath)} --project <project_id>`,
    alternatePersistCommand:
      singleProject
        ? `analyticscli projects select ${singleProject.id}`
        : 'analyticscli projects select <project_id>',
    retryCommand: `node scripts/openclaw-growth-start.mjs --config ${quote(configPath)}`,
    rawError: truncate(rawError, 800),
    projectListError: projectList.ok ? null : truncate(projectList.error, 800),
  };
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
  const projectConfigured = await configureAnalyticsProject(configPath, args.project);
  const analyticscliEnsure = await ensureAnalyticsCliInstalled();
  if (!analyticscliEnsure.ok) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          phase: 'dependency_setup',
          configCreated: configResult.created,
          configPath,
          projectConfigured,
          blockers: [
            {
              check: 'dependency:analyticscli',
              detail: analyticscliEnsure.detail,
              remediation: `Install the npm package with \`npm install -g ${ANALYTICSCLI_PACKAGE_SPEC}\` or set ANALYTICSCLI_NPM_PREFIX to a writable prefix.`,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const connectorSetup = args.connectors.length > 0 ? await installConnectorHelpers(configPath, args.connectors) : [];
  const failedConnectors = connectorSetup.filter((entry) => !entry.ok);
  if (failedConnectors.length > 0 && !args.run) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          phase: 'connector_setup',
          configCreated: configResult.created,
          configPath,
          projectConfigured,
          connectorSetup,
          blockers: failedConnectors.map((entry) => ({
            check: `connector:${entry.connector}`,
            detail: entry.detail,
            remediation:
              entry.connector === 'github'
                ? 'Install GitHub CLI (`gh`) and run `gh auth login`, or provide a fine-grained read-only token for code access.'
                : entry.connector === 'asc'
                  ? 'Install the ASC CLI and provide ASC_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_PATH or ASC_PRIVATE_KEY. Resolve the app after auth succeeds.'
                  : 'Set REVENUECAT_API_KEY and rerun connector setup to write RevenueCat MCP config.',
          })),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const preflightResult = await runPreflight(configPath, args.testConnections);
  const preflightPayload = preflightResult.payload;

  if (!preflightPayload) {
    throw new Error(
      `Preflight returned invalid output.\nstdout:\n${preflightResult.shell.stdout}\nstderr:\n${preflightResult.shell.stderr}`,
    );
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
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          phase: 'preflight',
          configCreated: configResult.created,
          configPath,
          projectConfigured,
          githubRepo: configResult.githubRepo,
          connectorSetup,
          blockers,
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!args.run) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          phase: 'setup_complete',
          configCreated: configResult.created,
          configPath,
          projectConfigured,
          connectorSetup,
          message: 'Preflight passed. First run skipped due to --setup-only.',
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const runResult = await runFirstPass(configPath);
  if (!runResult.ok) {
    const rawError = runResult.stderr || `exit ${runResult.code}`;
    if (isMissingProjectSelection(rawError)) {
      process.stdout.write(
        `${JSON.stringify(
          await buildProjectSelectionResponse({
            configCreated: configResult.created,
            configPath,
            projectConfigured,
            rawError,
          }),
          null,
          2,
        )}\n`,
      );
      return;
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          phase: 'first_run',
          configCreated: configResult.created,
          configPath,
          projectConfigured,
          error: rawError,
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const actionMode = getActionMode(await readJson(configPath));
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        phase: 'first_run_complete',
        configCreated: configResult.created,
        configPath,
        projectConfigured,
        actionMode,
        runnerOutput: runResult.stdout.trim(),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
