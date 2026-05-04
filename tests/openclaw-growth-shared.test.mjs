import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAutoCreateGitHubArtifact } from '../scripts/openclaw-growth-shared.mjs';

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
