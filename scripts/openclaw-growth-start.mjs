#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { getActionMode } from './openclaw-growth-shared.mjs';

const DEFAULT_CONFIG_PATH = 'data/openclaw-growth-engineer/config.json';
const DEFAULT_TEMPLATE_PATH = 'data/openclaw-growth-engineer/config.example.json';

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
    } else if (token === '--config') {
      args.config = next || args.config;
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

function quote(value) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(String(value))) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runShellCommand(command, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
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
        mode: 'file',
        path: 'data/openclaw-growth-engineer/analytics_summary.json',
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
      autoCreateIssues: true,
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

function remediationForCheck(checkName, configPath) {
  if (checkName === 'dependency:analyticscli') {
    return 'Install AnalyticsCLI CLI (`npm i -g @analyticscli/cli`).';
  }
  if (checkName === 'dependency:analyticscli-skill') {
    return 'Install/fetch `analyticscli-cli` skill in OpenClaw/ClawHub.';
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
    return 'Verify AnalyticsCLI auth (`ANALYTICSCLI_READONLY_TOKEN` or local `analyticscli login`) and selected project.';
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
          githubRepo: configResult.githubRepo,
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
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          phase: 'first_run',
          configCreated: configResult.created,
          configPath,
          error: runResult.stderr || `exit ${runResult.code}`,
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
