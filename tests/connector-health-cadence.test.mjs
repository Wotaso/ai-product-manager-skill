import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const skillRoot = resolve(import.meta.dirname, '..');

test('connector health defaults to a 12 hour cadence', () => {
  const config = JSON.parse(
    readFileSync(join(skillRoot, 'data/openclaw-growth-engineer/config.example.json'), 'utf8'),
  );
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');
  const start = readFileSync(join(skillRoot, 'scripts/openclaw-growth-start.mjs'), 'utf8');

  assert.equal(config.schedule.connectorHealthCheckIntervalMinutes, 720);
  assert.match(runner, /DEFAULT_CONNECTOR_HEALTH_INTERVAL_MINUTES = 720/);
  assert.match(start, /connectorHealthCheckIntervalMinutes/);
  assert.match(start, /Math\.min/);
});

test('unchanged unhealthy connectors are alerted once per incident until recovery or fingerprint changes', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /previousIncidentFingerprint !== fingerprint/);
  assert.match(runner, /activeIncidentFingerprint = fingerprint/);
  assert.doesNotMatch(runner, /isDue\(healthState\.lastAlertedAt, intervalMinutes\)/);
});

test('wizard exposes separate connector interval and output setup paths', () => {
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');

  assert.match(wizard, /What do you want to configure/);
  assert.match(wizard, /Connectors: credentials and provider health checks/);
  assert.match(wizard, /Intervals: growth cadence and connector health check interval/);
  assert.match(wizard, /Output: summary, GitHub issues, draft PRs, and notifications/);
  assert.match(wizard, /openClawCanEditConnectors: true/);
  assert.match(wizard, /openClawCanEditConnectorSecrets: false/);
  assert.match(wizard, /non-secret connector config/);
  assert.match(wizard, /ENABLE_ISOLATED_SECRET_RUNNER_WIZARD = false/);
  assert.match(wizard, /mode: 'openclaw-secret-refs'/);
  assert.match(wizard, /analyticsTokenRef: \{ source: 'env', provider: 'default', id: 'ANALYTICSCLI_ACCESS_TOKEN' \}/);
  assert.match(wizard, /once_per_unhealthy_incident_until_recovery_or_changed_fingerprint/);
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
