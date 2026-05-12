import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const skillRoot = resolve(import.meta.dirname, '..');

test('connector health defaults to a 6 hour cadence', () => {
  const config = JSON.parse(
    readFileSync(join(skillRoot, 'data/openclaw-growth-engineer/config.example.json'), 'utf8'),
  );
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');
  const start = readFileSync(join(skillRoot, 'scripts/openclaw-growth-start.mjs'), 'utf8');

  assert.equal(config.schedule.connectorHealthCheckIntervalMinutes, 360);
  assert.match(runner, /DEFAULT_CONNECTOR_HEALTH_INTERVAL_MINUTES = 360/);
  assert.match(start, /connectorHealthCheckIntervalMinutes/);
  assert.match(start, /Math\.min/);
});

test('unchanged unhealthy connectors are alerted once per incident until recovery or fingerprint changes', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /previousIncidentFingerprint !== fingerprint/);
  assert.match(runner, /activeIncidentFingerprint = fingerprint/);
  assert.doesNotMatch(runner, /isDue\(healthState\.lastAlertedAt, intervalMinutes\)/);
});

test('wizard exposes connector and output interval setup paths', () => {
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');

  assert.match(wizard, /What do you want to configure/);
  assert.match(wizard, /Use Up\/Down to move, Enter to continue, or press 1-4/);
  assert.match(wizard, /label: 'Connectors'/);
  assert.match(wizard, /Credentials, provider setup, and health checks/);
  assert.match(wizard, /label: 'Outputs and intervals'/);
  assert.match(wizard, /Daily\/weekly\/monthly jobs, GitHub issue\/PR delivery, and OpenClaw chat notifications/);
  assert.match(wizard, /label: 'Advanced intervals only'/);
  assert.match(wizard, /Runner wake-up interval and connector health check cadence/);
  assert.match(wizard, /Daily Sentry and production guardrail/);
  assert.match(wizard, /openClawCanEditConnectors: true/);
  assert.match(wizard, /openClawCanEditConnectorSecrets: false/);
  assert.match(wizard, /non-secret connector config/);
  assert.match(wizard, /ENABLE_ISOLATED_SECRET_RUNNER_WIZARD = false/);
  assert.match(wizard, /mode: 'openclaw-secret-refs'/);
  assert.match(wizard, /analyticsTokenRef: \{ source: 'env', provider: 'default', id: 'ANALYTICSCLI_ACCESS_TOKEN' \}/);
  assert.match(wizard, /once_per_unhealthy_incident_until_recovery_or_changed_fingerprint/);
  assert.doesNotMatch(wizard, /GitHub repo \(owner\/name/);
  assert.doesNotMatch(wizard, /Project slugs for/);
  assert.match(wizard, /Project scope remains unpinned/);
});

test('config example stores connector credentials as OpenClaw-style secret refs', () => {
  const config = JSON.parse(
    readFileSync(join(skillRoot, 'data/openclaw-growth-engineer/config.example.json'), 'utf8'),
  );

  assert.deepEqual(config.secrets.githubTokenRef, {
    source: 'env',
    provider: 'default',
    id: 'GITHUB_TOKEN',
  });
  assert.deepEqual(config.secrets.analyticsTokenRef, {
    source: 'env',
    provider: 'default',
    id: 'ANALYTICSCLI_ACCESS_TOKEN',
  });
});
