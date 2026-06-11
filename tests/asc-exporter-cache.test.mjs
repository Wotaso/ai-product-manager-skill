import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const skillRoot = resolve(import.meta.dirname, '..');

test('ASC exporter downloads compressed reports once and reuses the daily cache', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'openclaw-asc-cache-test-'));
  try {
    const binDir = join(tmp, 'bin');
    mkdirSync(binDir, { recursive: true });
    const fakeAsc = join(binDir, 'asc');
    writeFileSync(
      fakeAsc,
      `#!/usr/bin/env node
const { writeFileSync, appendFileSync } = require('node:fs');
const { gzipSync } = require('node:zlib');

const args = process.argv.slice(2);
const logPath = process.env.FAKE_ASC_LOG;
if (logPath) appendFileSync(logPath, args.join(' ') + '\\n');
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : '';
const command = args.join(' ');

if (command.startsWith('apps list')) {
  console.log(JSON.stringify({ data: [{ id: '123456789', type: 'apps', attributes: { name: 'Test App' } }] }));
} else if (command.startsWith('status ')) {
  console.log(JSON.stringify({ appstore: { status: 'READY_FOR_SALE' } }));
} else if (command.startsWith('reviews ratings')) {
  console.log(JSON.stringify({ averageRating: 4.8, ratingCount: 120 }));
} else if (command.startsWith('reviews summarizations')) {
  console.log(JSON.stringify({ data: [] }));
} else if (command.startsWith('feedback ')) {
  console.log(JSON.stringify({ data: [] }));
} else if (command.startsWith('analytics requests')) {
  console.log(JSON.stringify({ data: [{ id: 'req_1', type: 'analyticsReportRequests' }] }));
} else if (command.startsWith('analytics view')) {
  console.log(JSON.stringify({ data: [{ id: 'inst_1', type: 'analyticsReportInstances', attributes: { name: 'App Store Downloads Instance' } }] }));
} else if (command.startsWith('analytics download')) {
  if (process.env.FAKE_ASC_FAIL_DOWNLOAD === '1') {
    process.stderr.write('download disabled for cache hit test\\n');
    process.exit(42);
  }
  const report = [
    'Date\\tApp Apple Identifier\\tSource Type\\tImpressions\\tProduct Page Views\\tFirst-Time Downloads\\tPurchases\\tDeveloper Proceeds\\tSessions\\tCrashes\\tApp Version',
    '2026-06-09\\t123456789\\tApp Store Search\\t1000\\t200\\t40\\t6\\t36.50\\t300\\t2\\t2.0.0',
    '2026-06-09\\t123456789\\tWeb Referrer\\t200\\t40\\t8\\t1\\t6.00\\t10\\t0\\t2.0.0',
  ].join('\\n') + '\\n';
  writeFileSync(outputPath, gzipSync(report));
  console.log(JSON.stringify({ output: outputPath }));
} else {
  console.log(JSON.stringify({}));
}
`,
      'utf8',
    );
    chmodSync(fakeAsc, 0o755);

    const cacheDir = join(tmp, 'cache');
    const logPath = join(tmp, 'asc.log');
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH || ''}`,
      FAKE_ASC_LOG: logPath,
    };
    const args = [
      join(skillRoot, 'scripts/export-asc-summary.mjs'),
      '--cache-dir',
      cacheDir,
      '--end',
      '2026-06-09',
      '--analytics-instance-limit',
      '1',
      '--max-signals',
      '8',
    ];

    const first = spawnSync(process.execPath, args, { cwd: tmp, env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const firstPayload = JSON.parse(first.stdout);
    assert.equal(firstPayload.meta.analytics.units.total, 48);
    assert.equal(firstPayload.meta.analytics.impressions.total, 1200);
    assert.equal(firstPayload.meta.analytics.purchases.total, 7);
    assert.equal(firstPayload.meta.analytics.totalCrashes, 2);
    assert.equal(firstPayload.meta.batchReports[0].cacheStatus, 'downloaded');

    const second = spawnSync(process.execPath, args, {
      cwd: tmp,
      env: { ...env, FAKE_ASC_FAIL_DOWNLOAD: '1' },
      encoding: 'utf8',
    });
    assert.equal(second.status, 0, second.stderr);
    const secondPayload = JSON.parse(second.stdout);
    assert.equal(secondPayload.meta.analytics.units.total, 48);
    assert.equal(secondPayload.meta.batchReports[0].cacheStatus, 'hit');

    const commandLog = readFileSync(logPath, 'utf8');
    assert.equal((commandLog.match(/analytics download/g) || []).length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
