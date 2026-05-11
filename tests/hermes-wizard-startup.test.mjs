import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const skillRoot = resolve(import.meta.dirname, '..');

test('Hermes startup instructions route first setup through the connector wizard', () => {
  const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');

  assert.match(skill, /## Hermes Startup Override/);
  assert.match(skill, /node scripts\/openclaw-growth-wizard\.mjs --connectors/);
  assert.match(skill, /Do not satisfy those messages by only installing `analyticscli`/);
});

test('runtime auth remediation does not route AnalyticsCLI setup to standalone login', () => {
  const runtimeFiles = [
    'scripts/openclaw-growth-preflight.mjs',
    'scripts/openclaw-growth-start.mjs',
  ];

  for (const file of runtimeFiles) {
    const source = readFileSync(join(skillRoot, file), 'utf8');
    assert.doesNotMatch(source, /analyticscli login/);
    assert.match(source, /openclaw-growth-wizard\.mjs --connectors analytics/);
  }
});
