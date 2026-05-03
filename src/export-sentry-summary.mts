#!/usr/bin/env node

import { writeJsonOutput, buildSentrySummary } from './openclaw-exporters-lib.mjs';

const DEFAULT_BASE_URL = 'https://sentry.io';

function printHelpAndExit(exitCode, reason = null) {
  if (reason) {
    process.stderr.write(`${reason}\n\n`);
  }
  process.stdout.write(`
Export Sentry Summary

Builds an OpenClaw-compatible crash/stability summary JSON from the Sentry API.

Usage:
  node scripts/export-sentry-summary.mjs [options]

Options:
  --org <slug>           Sentry organization slug (default: SENTRY_ORG)
  --project <slug>       Sentry project slug (default: SENTRY_PROJECT)
  --environment <name>   Sentry environment filter (default: SENTRY_ENVIRONMENT or production)
  --last <duration>      Sentry statsPeriod, e.g. 24h, 7d, 30d (default: 7d)
  --query <query>        Issue search query (default: is:unresolved)
  --limit <n>            Max Sentry issues to fetch, capped at 50 (default: 20)
  --max-signals <n>      Max normalized signals/issues to emit (default: 5)
  --base-url <url>       Sentry base URL for self-hosted instances (default: SENTRY_BASE_URL or ${DEFAULT_BASE_URL})
  --out <file>           Write JSON to file instead of stdout
  --help, -h             Show help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    org: String(process.env.SENTRY_ORG || '').trim(),
    project: String(process.env.SENTRY_PROJECT || '').trim(),
    environment: String(process.env.SENTRY_ENVIRONMENT || 'production').trim(),
    last: '7d',
    query: 'is:unresolved',
    limit: 20,
    maxSignals: 5,
    baseUrl: String(process.env.SENTRY_BASE_URL || DEFAULT_BASE_URL).trim(),
    out: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--') {
      continue;
    } else if (token === '--org') {
      args.org = String(next || '').trim();
      index += 1;
    } else if (token === '--project') {
      args.project = String(next || '').trim();
      index += 1;
    } else if (token === '--environment') {
      args.environment = String(next || '').trim();
      index += 1;
    } else if (token === '--last') {
      args.last = String(next || args.last).trim();
      index += 1;
    } else if (token === '--query') {
      args.query = String(next || '').trim();
      index += 1;
    } else if (token === '--limit') {
      args.limit = normalizeInteger(next, '--limit', 1, 50);
      index += 1;
    } else if (token === '--max-signals') {
      args.maxSignals = normalizeInteger(next, '--max-signals', 1, 20);
      index += 1;
    } else if (token === '--base-url') {
      args.baseUrl = String(next || '').trim();
      index += 1;
    } else if (token === '--out') {
      args.out = String(next || '').trim();
      index += 1;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
      printHelpAndExit(1, `Unknown argument: ${token}`);
    }
  }

  return args;
}

function normalizeInteger(value, label, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    printHelpAndExit(1, `${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function requireValue(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} is required. Set it in the Sentry connector wizard or pass the flag explicitly.`);
  }
  return normalized;
}

function buildUrl(baseUrl, pathname, params) {
  const url = new URL(pathname, `${baseUrl.replace(/\/$/, '')}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function sentryFetchJson(url, token) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'openclaw-growth-sentry-exporter',
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Sentry API ${response.status}: ${body.slice(0, 500) || 'request failed'}`);
  }
  return body ? JSON.parse(body) : null;
}

function redactString(value) {
  return String(value || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]');
}

function redactData(value) {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redactData(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        ['email', 'ip', 'ip_address'].includes(key.toLowerCase()) ? '[REDACTED]' : redactData(entry),
      ]),
    );
  }
  return value;
}

async function listIssues(args, token) {
  const org = encodeURIComponent(requireValue(args.org, 'SENTRY_ORG'));
  const project = encodeURIComponent(requireValue(args.project, 'SENTRY_PROJECT'));
  const url = buildUrl(args.baseUrl || DEFAULT_BASE_URL, `/api/0/projects/${org}/${project}/issues/`, {
    statsPeriod: args.last,
    environment: args.environment,
    query: args.query,
    per_page: args.limit,
  });
  const payload = await sentryFetchJson(url, token);
  return Array.isArray(payload) ? payload : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = requireValue(process.env.SENTRY_AUTH_TOKEN, 'SENTRY_AUTH_TOKEN');
  const issuesPayload = redactData(await listIssues(args, token));
  const summary = buildSentrySummary({
    org: args.org,
    project: args.project,
    environment: args.environment,
    last: args.last,
    issuesPayload,
    maxSignals: args.maxSignals,
  });
  await writeJsonOutput(args.out, summary);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
