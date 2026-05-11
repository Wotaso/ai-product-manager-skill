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

test('unchanged unhealthy connectors are re-alerted after the health interval', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /lastAlertedFingerprint !== fingerprint/);
  assert.match(runner, /isDue\(healthState\.lastAlertedAt, intervalMinutes\)/);
});
