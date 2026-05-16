import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGrowthRunnerCommand,
  buildOpenClawGrowthSystemEvent,
  deriveSchedulerProofPathFromStatePath,
  deriveStatePathFromConfigPath,
  getGitHubArtifactModes,
  shouldAutoCreateGitHubArtifact,
} from '../scripts/openclaw-growth-shared.mjs';

test('shouldAutoCreateGitHubArtifact auto-enables issues when GitHub token and repo are configured', () => {
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  try {
    assert.equal(
      shouldAutoCreateGitHubArtifact({
        project: { githubRepo: 'owner/repo' },
        actions: { mode: 'issue', autoCreateIssues: false },
      }),
      true,
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});

test('shouldAutoCreateGitHubArtifact respects explicit GitHub artifact opt-out', () => {
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  try {
    assert.equal(
      shouldAutoCreateGitHubArtifact({
        project: { githubRepo: 'owner/repo' },
        actions: { mode: 'issue', disableAutoCreateGitHubArtifacts: true },
      }),
      false,
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});

test('getGitHubArtifactModes supports multiple selected GitHub artifact outputs', () => {
  assert.deepEqual(
    getGitHubArtifactModes({
      actions: {
        outputDestinations: ['openclaw_chat', 'github_issue', 'github_pull_request'],
        autoCreateIssues: true,
        autoCreatePullRequests: true,
      },
      deliveries: {
        github: {
          modes: ['issue', 'pull_request'],
        },
      },
    }),
    ['issue', 'pull_request'],
  );
});

test('explicit chat-only output destinations disable GitHub artifact fallback', () => {
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  try {
    const config = {
      project: { githubRepo: 'owner/repo' },
      actions: {
        mode: 'issue',
        outputDestinations: ['openclaw_chat'],
        autoCreateIssues: false,
        autoCreatePullRequests: false,
      },
    };
    assert.deepEqual(getGitHubArtifactModes(config), []);
    assert.equal(shouldAutoCreateGitHubArtifact(config), false);
  } finally {
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});

test('OpenClaw cron commands keep state and proof beside the active config', () => {
  const configPath = '/home/lo/data/openclaw-growth-engineer/config.json';
  const statePath = '/home/lo/data/openclaw-growth-engineer/state.json';
  const proofPath = '/home/lo/data/openclaw-growth-engineer/runtime/scheduler-proof.jsonl';

  assert.equal(deriveStatePathFromConfigPath(configPath), statePath);
  assert.equal(deriveSchedulerProofPathFromStatePath(statePath), proofPath);
  assert.equal(
    buildGrowthRunnerCommand(configPath),
    `node scripts/openclaw-growth-runner.mjs --config ${configPath} --state ${statePath}`,
  );

  const eventText = buildOpenClawGrowthSystemEvent(configPath, {});
  assert.match(eventText, new RegExp(`--state ${statePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(eventText, new RegExp(proofPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
