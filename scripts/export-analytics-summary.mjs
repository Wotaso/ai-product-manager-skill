#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';
import { buildAnalyticsSummary, writeJsonOutput } from './openclaw-exporters-lib.mjs';

function printHelpAndExit(exitCode, reason = null) {
  if (reason) {
    process.stderr.write(`${reason}\n\n`);
  }
  process.stdout.write(`
Export Analytics Summary

Builds an OpenClaw-compatible analytics_summary JSON by querying analyticscli.

Usage:
  node scripts/export-analytics-summary.mjs [options]

Options:
  --project <id>       AnalyticsCLI project ID (optional when a default project is selected)
  --last <duration>    Relative time window like 30d (default: 30d)
  --out <file>         Write JSON to file instead of stdout
  --include-debug      Include development/debug data
  --max-signals <n>    Maximum signals to emit (default: 4)
  --help, -h           Show help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    project: '',
    last: '30d',
    out: '',
    includeDebug: false,
    maxSignals: 4,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--') {
      continue;
    } else if (token === '--project') {
      args.project = String(next || '').trim();
      index += 1;
    } else if (token === '--last') {
      args.last = String(next || '30d').trim() || '30d';
      index += 1;
    } else if (token === '--out') {
      args.out = String(next || '').trim();
      index += 1;
    } else if (token === '--include-debug') {
      args.includeDebug = true;
    } else if (token === '--max-signals') {
      const parsed = Number.parseInt(String(next || ''), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        printHelpAndExit(1, `Invalid value for --max-signals: ${String(next || '')}`);
      }
      args.maxSignals = parsed;
      index += 1;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
      printHelpAndExit(1, `Unknown argument: ${token}`);
    }
  }

  return args;
}

function runJsonCommand(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(stderr.trim() || `${command} exited with code ${code}`);
        error.exitCode = code;
        reject(error);
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`${command} returned non-JSON output`));
      }
    });
  });
}

function buildBaseArgs(input) {
  const args = ['--format', 'json'];
  if (input.project) {
    args.push('--project', input.project);
  }
  if (input.includeDebug) {
    args.push('--include-debug');
  }
  return args;
}

async function runOptionalAnalyticsQuery(label, args) {
  try {
    return await runJsonCommand('analyticscli', args);
  } catch (error) {
    const exitCode = error && typeof error === 'object' && 'exitCode' in error ? error.exitCode : null;
    if (exitCode === 2) {
      return null;
    }
    throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseArgs = buildBaseArgs(args);

  const onboardingJourney = await runOptionalAnalyticsQuery('onboarding journey query', [
    ...baseArgs,
    'get',
    'onboarding-journey',
    '--within',
    'user',
    '--last',
    args.last,
    '--with-trends',
  ]);

  const retention = await runOptionalAnalyticsQuery('retention query', [
    ...baseArgs,
    'retention',
    '--anchor-event',
    'onboarding:start',
    '--days',
    '1,3,7',
    '--max-age-days',
    '90',
    '--last',
    args.last,
  ]);

  const summary = buildAnalyticsSummary({
    projectId: args.project,
    last: args.last,
    onboardingJourney,
    retention,
    maxSignals: args.maxSignals,
  });

  await writeJsonOutput(args.out, summary);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
