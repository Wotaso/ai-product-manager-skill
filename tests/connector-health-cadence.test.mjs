import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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

test('unchanged unhealthy connectors are retried until an external alert is delivered', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /previousExternallyDeliveredFingerprint !== fingerprint/);
  assert.match(runner, /activeIncidentFingerprint = fingerprint/);
  assert.match(runner, /lastExternalAlertedFingerprint = fingerprint/);
  assert.match(runner, /hasSuccessfulExternalDelivery\(deliveries\)/);
  assert.match(runner, /connector_health_unchanged/);
  assert.match(runner, /persisted unhealthy state is not a new event/);
  assert.match(runner, /alertTriggered \? 'CONNECTOR_HEALTH_ALERT' : 'HEARTBEAT_OK'/);
  assert.doesNotMatch(runner, /isDue\(healthState\.lastAlertedAt, intervalMinutes\)/);
});

test('notification delivery fallbacks are merged with explicit channels', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');

  assert.match(runner, /function mergeNotificationChannelsWithDeliveries/);
  assert.match(runner, /getDeliveryNotificationChannels\(config, 'connectorHealth'\)/);
  assert.match(runner, /getDeliveryNotificationChannels\(config, 'growthRun'\)/);
  assert.match(runner, /if \(type === 'command'\)\s+return `command:\$\{channel\?\.label \|\| channel\?\.command \|\| 'command'\}`/);
  assert.match(runner, /deliveries\.command\?\.enabled/);
  assert.match(runner, /external: false/);
  assert.match(runner, /Alert written locally, but no external notification channel configured/);
  assert.doesNotMatch(runner, /if \(configuredChannels\.length > 0\)\s*return configuredChannels/);
  assert.doesNotMatch(runner, /discord-openclaw-bridge/);
  assert.doesNotMatch(wizard, /discord-openclaw-bridge/);
});

test('due growth cadences still run and log, but suppress social delivery when findings are unchanged', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /skippedReason: 'cadence_not_due'/);
  assert.doesNotMatch(runner, /activeCadences\.length === 0 &&\s+unchangedIssueSet/);
  assert.match(runner, /Skip GitHub creation and external growth notification/);
  assert.match(runner, /issue set unchanged; external growth notification suppressed/);
  assert.match(runner, /externalGrowthNotification: 'suppressed_unchanged_issue_set'/);
  assert.match(runner, /issueSetChangedOrExplicitlyAllowed/);
  assert.match(runner, /lastGrowthRunNotifications: await deliverGrowthRunSummary/);
});

test('scheduled source collection retries transient upstream failures once', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /function isTransientNetworkFailure/);
  assert.match(runner, /function isRequiredSource/);
  assert.match(runner, /upstream connect error/);
  assert.match(runner, /disconnect\\\/reset before headers/);
  assert.match(runner, /isTransientNetworkFailure\(result\.stderr \|\| result\.stdout\)/);
  assert.match(runner, /transient network error persisted after retry/);
  assert.match(runner, /lastRetriedTransientFailureAt/);
  assert.match(runner, /source_collection_degraded/);
  assert.match(runner, /lastSourceFailures/);
  assert.match(runner, /socialOutput: 'HEARTBEAT_OK'/);
});

test('required Sentry-compatible API 5xx failures are still degraded after retry', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /function isSentryCompatibleSource/);
  assert.match(runner, /sourceKey === 'sentry'/);
  assert.match(runner, /sourceKey === 'glitchtip'/);
  assert.match(runner, /command\.includes\('export-sentry-summary'\)/);
  assert.match(runner, /function shouldDegradeTransientSourceFailure/);
  assert.match(runner, /if \(!isRequiredSource\(sourceConfig, sourceName\)\)\s+return true/);
  assert.match(runner, /return isSentryCompatibleSource\(sourceConfig, sourceName\)/);
  assert.match(runner, /shouldDegradeTransientSourceFailure\(sourceConfig, sourceName, retried\)/);
});

test('Sentry exporter retries retryable API failures before surfacing the error', () => {
  const exporter = readFileSync(join(skillRoot, 'scripts/export-sentry-summary.mjs'), 'utf8');

  assert.match(exporter, /DEFAULT_SENTRY_FETCH_RETRIES = 3/);
  assert.match(exporter, /function isRetryableSentryStatus/);
  assert.match(exporter, /status === 429 \|\| status >= 500/);
  assert.match(exporter, /retry-after/);
  assert.match(exporter, /Sentry API \$\{response\.status\}/);
});

test('wizard persists active config paths for config-driven exporters', () => {
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');

  assert.match(wizard, /function sourceCommandNeedsActiveConfig/);
  assert.match(wizard, /value\.includes\('export-sentry-summary'\)/);
  assert.match(wizard, /value\.includes\('exporters coolify-summary'\)/);
  assert.match(wizard, /function withWizardConfigArg/);
  assert.match(wizard, /--config \$\{quote\(configPath\)\}/);
  assert.match(wizard, /migrateRuntimeSourceCommands\(existing, configPath\)/);
  assert.match(wizard, /normalizeWizardSourceCommand\('sentry', config\.sources\?\.sentry \|\| \{\}, configPath\)/);
  assert.match(wizard, /buildDefaultWizardConfig\(configPath\)/);
  assert.match(wizard, /buildRecommendedSourceConfig\(configPath\)/);
  assert.match(wizard, /buildSourceConfigFromInputChannels\(selected, config\.sources \|\| \{\}, configPath\)/);
});

test('wizard sandbox smoke migrates Sentry and Coolify commands to the active config', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'openclaw-growth-sandbox-'));
  try {
    const configPath = join(tmp, 'custom-config.json');
    writeFileSync(
      configPath,
      `${JSON.stringify({
        version: 7,
        sources: {
          sentry: {
            enabled: true,
            mode: 'command',
            command: 'node scripts/export-sentry-summary.mjs',
            accounts: [
              {
                id: 'sentry_cloud',
                label: 'Sentry Cloud',
                baseUrl: 'https://sentry.io',
                tokenEnv: 'SENTRY_CLOUD_TOKEN',
                org: 'example-org',
                projects: ['example-app'],
              },
            ],
          },
          coolify: {
            enabled: true,
            mode: 'command',
            command: 'npx -y @analyticscli/growth-engineer@preview exporters coolify-summary',
            baseUrl: 'https://coolify.example.com',
            tokenEnv: 'COOLIFY_API_TOKEN',
          },
        },
      }, null, 2)}\n`,
    );

    const result = spawnSync(
      process.execPath,
      [
        join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'),
        '--config',
        configPath,
        '--sandbox-smoke',
      ],
      {
        cwd: tmp,
        env: {
          ...process.env,
          OPENCLAW_GROWTH_SKIP_SELF_UPDATE: '1',
        },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const migrated = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.match(migrated.sources.sentry.command, /export-sentry-summary\.mjs/);
    assert.match(migrated.sources.sentry.command, new RegExp(`--config ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(migrated.sources.coolify.command, /exporters coolify-summary/);
    assert.match(migrated.sources.coolify.command, new RegExp(`--config ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.doesNotMatch(migrated.sources.sentry.command, /data\/openclaw-growth-engineer\/config\.json/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('optional source collection failures become connector-health incidents', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');

  assert.match(runner, /source_collection_degraded/);
  assert.match(runner, /Source collection failed during scheduled run/);
  assert.match(runner, /Optional source "\$\{source\.key\}" failed; continuing without it/);
  assert.match(runner, /if \(source\.key === 'analytics'\)/);
  assert.match(runner, /recordSourceCollectionFailures/);
  assert.match(runner, /new or changed source-collection connector incident/);
});

test('connector health alerts include direct repair commands without broad menu detours', () => {
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');

  assert.match(runner, /Run on the host terminal/);
  assert.match(runner, /npx -y @analyticscli\/growth-engineer@preview wizard --connectors/);
  assert.doesNotMatch(runner, /@analyticscli\/growth-engineer@preview wizard --connectors .*--config/);
  assert.doesNotMatch(runner, /nodeRuntimeScriptCommand\('openclaw-growth-wizard\.mjs'\)/);
  assert.match(runner, /ASC web-auth refresh only/);
  assert.match(runner, /asc web auth login --apple-id "\$ASC_WEB_APPLE_ID"/);
  assert.match(runner, /Do not rerun the API-key ASC wizard unless the API-key smoke test also fails/);
  assert.match(wizard, /requestedConnectors\.length > 0\s+\? orderConnectors\(requestedConnectors\)/);
  assert.doesNotMatch(wizard, /requestedConnectors\.length > 0\s+\? orderConnectors\(\[\.\.\.new Set\(\[\.\.\.requestedConnectors, \.\.\.existingFixes\]\)\]\)/);
});

test('agent-facing wizard guidance uses the npx Growth Engineer package', () => {
  const files = [
    'SKILL.md',
    'scripts/openclaw-growth-preflight.mjs',
    'scripts/openclaw-growth-status.mjs',
    'scripts/openclaw-growth-start.mjs',
    'scripts/openclaw-growth-runner.mjs',
    'scripts/openclaw-growth-wizard.mjs',
    'references/setup-and-scheduling.md',
    'references/advanced-setup.md',
  ];

  for (const file of files) {
    const source = readFileSync(join(skillRoot, file), 'utf8');
    assert.match(source, /npx -y @analyticscli\/growth-engineer@preview wizard/);
    assert.doesNotMatch(source, /node scripts\/openclaw-growth-wizard\.mjs/);
    assert.doesNotMatch(source, /@analyticscli\/growth-engineer@preview wizard --connectors .*--config/);
  }
});

test('ASC wizard requests the report-creation role and vendor number', () => {
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');
  const start = readFileSync(join(skillRoot, 'scripts/openclaw-growth-start.mjs'), 'utf8');
  const exportAsc = readFileSync(join(skillRoot, 'scripts/export-asc-summary.mjs'), 'utf8');

  assert.match(wizard, /Required for first setup: Admin/);
  assert.match(wizard, /create the initial Analytics Report Request/);
  assert.match(wizard, /Sales and Reports/);
  assert.match(wizard, /Growth Engineer automatically creates an ongoing App Analytics report request/);
  assert.match(wizard, /ASC_VENDOR_NUMBER for Sales and Trends\/App Units/);
  assert.match(wizard, /process\.env\.ASC_ANALYTICS_VENDOR_NUMBER/);
  assert.match(start, /configureAscAllApps/);
  assert.match(start, /removeAscAppFlag/);
  assert.match(start, /delete process\.env\.ASC_APP_ID/);
  assert.match(start, /ensureAscAnalyticsRequestsForAppScope/);
  assert.match(start, /asc analytics request --app/);
  assert.match(start, /--access-type ONGOING/);
  assert.match(start, /phase: 'asc_analytics_request_setup'/);
  assert.match(start, /Use an ASC API key with Admin for first setup/);
  assert.doesNotMatch(wizard, /ASC_APP_ID for the app to analyze/);
  assert.doesNotMatch(exportAsc, /app: String\(process\.env\.ASC_APP_ID/);
  assert.doesNotMatch(wizard, /Avoid: Admin unless/);
});

test('wizard exposes connector and output interval setup paths', () => {
  const wizard = readFileSync(join(skillRoot, 'scripts/openclaw-growth-wizard.mjs'), 'utf8');
  const shared = readFileSync(join(skillRoot, 'scripts/openclaw-growth-shared.mjs'), 'utf8');

  assert.match(wizard, /What do you want to configure/);
  assert.match(wizard, /Use Up\/Down to move, Enter to continue, or press 1-4/);
  assert.match(wizard, /label: 'Connectors'/);
  assert.match(wizard, /Credentials, provider setup, and health checks/);
  assert.match(wizard, /label: 'Outputs and intervals'/);
  assert.match(wizard, /Daily\/weekly\/monthly jobs, GitHub issue\/PR delivery, and OpenClaw chat notifications/);
  assert.match(wizard, /label: 'Advanced intervals only'/);
  assert.match(wizard, /Runner wake-up interval and connector health check cadence/);
  assert.match(wizard, /90-minute production error healthcheck/);
  assert.match(wizard, /Daily behavioral anomaly guardrail/);
  assert.match(wizard, /openClawCanEditConnectors: true/);
  assert.match(wizard, /openClawCanEditConnectorSecrets: false/);
  assert.match(wizard, /non-secret connector config/);
  assert.match(wizard, /ENABLE_ISOLATED_SECRET_RUNNER_WIZARD = false/);
  assert.match(wizard, /mode: 'openclaw-secret-refs'/);
  assert.match(wizard, /analyticsTokenRef: \{ source: 'env', provider: 'default', id: 'ANALYTICSCLI_ACCESS_TOKEN' \}/);
  assert.match(wizard, /once_per_unhealthy_incident_until_recovery_or_changed_fingerprint/);
  assert.doesNotMatch(wizard, /GitHub repo \(owner\/name/);
  assert.doesNotMatch(wizard, /Project slugs for/);
  assert.doesNotMatch(wizard, /Issue labels \(comma-separated\)/);
  assert.doesNotMatch(wizard, /Preferred GitHub artifact mode/);
  assert.doesNotMatch(wizard, /Use recommended input channels and default fetch commands/);
  assert.doesNotMatch(wizard, /Connector credentials are configured through the connector setup/);
  assert.doesNotMatch(wizard, /Usage mode \(1\/2\/3\)/);
  assert.doesNotMatch(wizard, /Output type \(1\/2\/3\)/);
  assert.match(wizard, /Project scope remains unpinned/);
  assert.match(wizard, /Input channels/);
  assert.match(wizard, /Select input channels/);
  assert.match(wizard, /runConnectorSetupSteps/);
  assert.match(wizard, /migrateRuntimeSourceCommandsFile/);
  assert.match(wizard, /replaceLegacyRuntimeScriptCommand/);
  assert.match(wizard, /export-analytics-summary\.mjs/);
  assert.match(wizard, /How should OpenClaw Growth Engineer run/);
  assert.match(wizard, /Output destinations/);
  assert.match(wizard, /Scheduled review cadences/);
  assert.match(wizard, /OpenClaw Gateway cron/);
  assert.match(wizard, /Hermes cron job/);
  assert.match(shared, /openclaw cron add/);
  assert.match(shared, /hermes cron create/);
  assert.match(wizard, /inspectOpenClawCronInstall/);
  assert.match(wizard, /inspectHermesCronInstall/);
  assert.match(wizard, /scheduler-proof\.jsonl/);
  assert.match(wizard, /Default growth cadence/);
  assert.match(wizard, /What it decides/);
  assert.match(wizard, /Space toggles, A toggles all optional items, Enter continues/);
  assert.match(wizard, /Customize GitHub issue\/PR limits, labels, or chart attachment settings/);
});

test('config example enables OpenClaw and Hermes cron with runner proof logs', () => {
  const config = JSON.parse(
    readFileSync(join(skillRoot, 'data/openclaw-growth-engineer/config.example.json'), 'utf8'),
  );
  const runner = readFileSync(join(skillRoot, 'scripts/openclaw-growth-runner.mjs'), 'utf8');
  const start = readFileSync(join(skillRoot, 'scripts/openclaw-growth-start.mjs'), 'utf8');

  assert.deepEqual(config.automation.openclawCron, {
    enabled: true,
    mode: 'main',
    schedule: '*/30 * * * *',
    timezone: 'UTC',
    name: 'OpenClaw Growth Engineer scheduler',
    delivery: {
      enabled: true,
      mode: 'announce',
      channel: 'last',
      to: '',
    },
  });
  assert.deepEqual(config.automation.hermesCron, {
    enabled: true,
    schedule: '*/30 * * * *',
    name: 'Hermes Growth Engineer scheduler',
    skill: 'growth-engineer',
    deliver: 'local',
  });
  assert.match(start, /openclaw cron add/);
  assert.match(start, /hermes cron create/);
  assert.match(start, /openclaw system event/);
  assert.match(start, /inspectOpenClawCronInstall/);
  assert.match(start, /inspectHermesCronInstall/);
  assert.match(runner, /DEFAULT_SCHEDULER_PROOF_PATH = 'data\/openclaw-growth-engineer\/runtime\/scheduler-proof\.jsonl'/);
  assert.match(runner, /deriveRuntimeDirFromStatePath\(statePath\)/);
  assert.match(runner, /deriveSchedulerProofPathFromStatePath\(statePath\)/);
  assert.match(runner, /runner_invoked/);
  assert.match(runner, /repairOpenClawCronDeliveryStore/);
  assert.match(runner, /openclaw_cron_delivery_repaired/);
  assert.match(runner, /function hardenUnattendedShellCommand/);
  assert.match(runner, /sudo -n/);
  assert.match(runner, /Blocked non-interactive sudo prompt/);
  assert.match(runner, /connector_health_checked/);
  assert.match(runner, /runner_completed/);
  assert.match(runner, /runner_failed/);
});

test('setup and preflight harden sudo commands for unattended VPS runs', () => {
  const start = readFileSync(join(skillRoot, 'scripts/openclaw-growth-start.mjs'), 'utf8');
  const preflight = readFileSync(join(skillRoot, 'scripts/openclaw-growth-preflight.mjs'), 'utf8');

  assert.match(start, /function hardenUnattendedShellCommand/);
  assert.match(start, /SUDO_ASKPASS/);
  assert.match(preflight, /function hardenUnattendedShellCommand/);
  assert.match(preflight, /SUDO_ASKPASS/);
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
