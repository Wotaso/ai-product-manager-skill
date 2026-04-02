const BUILTIN_SOURCE_NAMES = ['analytics', 'revenuecat', 'sentry', 'feedback'];

const SERVICE_KIND_ALIASES = {
  analytics: [
    'analytics',
    'analyticscli',
    'mixpanel',
    'amplitude',
    'firebase',
    'posthog',
    'telemetry',
  ],
  revenue: ['revenuecat', 'stripe', 'purchases', 'billing', 'adapty', 'superwall'],
  crash: ['sentry', 'glitchtip', 'crashlytics', 'bugsnag', 'datadog', 'rollbar'],
  feedback: [
    'feedback',
    'support',
    'intercom',
    'zendesk',
    'app-store-reviews',
    'app_store_reviews',
    'play-store-reviews',
    'play_console_reviews',
  ],
  store: [
    'asc',
    'asc-cli',
    'app-store-connect',
    'app_store_connect',
    'play-console',
    'play_console',
    'google-play',
    'google_play',
    'aso',
  ],
};

export function getBuiltinSourceNames() {
  return [...BUILTIN_SOURCE_NAMES];
}

export function normalizeServiceType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

export function classifyServiceKind(service) {
  const normalized = normalizeServiceType(service);
  for (const [kind, aliases] of Object.entries(SERVICE_KIND_ALIASES)) {
    if (aliases.includes(normalized)) {
      return kind;
    }
  }
  return 'custom';
}

export function normalizeSourceKey(value, fallback = 'source') {
  const normalized = normalizeServiceType(value).replace(/[.-]+/g, '_');
  return normalized || fallback;
}

export function getDefaultSourcePath(key) {
  return `data/openclaw-growth-engineer/${normalizeSourceKey(key)}_summary.json`;
}

export function getDefaultSourceHint(service) {
  const kind = classifyServiceKind(service);
  if (kind === 'analytics') {
    return '- Preferred: AnalyticsCLI bounded query/export written to JSON.\n- For command mode, output summary JSON in the shared signals[] shape.';
  }
  if (kind === 'revenue') {
    return '- Revenue provider summary with monetization deltas, package/offering signals, and churn notes.\n- Command mode should output JSON in the shared signals[] shape.';
  }
  if (kind === 'crash') {
    return '- Crash/error provider summary with top regressions, affected users, and issue evidence.\n- `issues[]` or shared `signals[]` payloads are both accepted.';
  }
  if (kind === 'feedback') {
    return '- Aggregate app reviews, support tickets, or in-app feedback into recurring themes.\n- `items[]` or shared `signals[]` payloads are both accepted.';
  }
  if (kind === 'store') {
    return '- Store/distribution summary from ASC CLI, Play Console exports, or release tooling.\n- Focus on review trends, release blockers, ratings, and ASO signals.';
  }
  return '- Any connector is supported when it can produce JSON in the shared `signals[]` shape.\n- Use `issues[]` for crash tools or `items[]` for feedback-like tools when that fits better.';
}

export function buildExtraSourceConfig(service, options = {}) {
  const normalizedService = normalizeServiceType(service);
  const key = normalizeSourceKey(options.key || normalizedService || `extra_${Date.now()}`);
  return {
    key,
    label: options.label || normalizedService || key,
    service: normalizedService || key,
    enabled: options.enabled !== false,
    mode: options.mode || 'file',
    path: options.path || getDefaultSourcePath(key),
    hint: options.hint || getDefaultSourceHint(normalizedService || key),
    secretEnv: options.secretEnv || null,
  };
}

export function getExtraSources(config) {
  const extra = Array.isArray(config?.sources?.extra) ? config.sources.extra : [];
  const seen = new Set();
  const result = [];

  for (const [index, source] of extra.entries()) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    const key = normalizeSourceKey(source.key || source.name || source.service || `extra_${index + 1}`);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      ...source,
      key,
      label: String(source.label || source.name || source.service || key),
      service: normalizeServiceType(source.service || source.name || key),
      enabled: source.enabled !== false,
      mode: String(source.mode || 'file').toLowerCase() === 'command' ? 'command' : 'file',
      secretEnv:
        typeof source.secretEnv === 'string' && source.secretEnv.trim()
          ? source.secretEnv.trim()
          : null,
      hint:
        typeof source.hint === 'string' && source.hint.trim()
          ? source.hint
          : getDefaultSourceHint(source.service || key),
    });
  }

  return result;
}

export function getAllSourceEntries(config) {
  const builtins = getBuiltinSourceNames()
    .filter((name) => Boolean(config?.sources?.[name]))
    .map((name) => {
      const source = config.sources[name];
      return {
        key: name,
        label: name,
        service: normalizeServiceType(source?.service || name),
        builtIn: true,
        ...(source || {}),
      };
    });

  return [...builtins, ...getExtraSources(config).map((source) => ({ ...source, builtIn: false }))];
}

export function getActionMode(config) {
  const configured = normalizeServiceType(config?.actions?.mode || '');
  if (configured === 'pull-request' || configured === 'pull_request' || configured === 'pr') {
    return 'pull_request';
  }
  if (config?.actions?.autoCreatePullRequests === true) {
    return 'pull_request';
  }
  return 'issue';
}

export function shouldAutoCreateGitHubArtifact(config) {
  const mode = getActionMode(config);
  if (mode === 'pull_request') {
    return config?.actions?.autoCreatePullRequests !== false;
  }
  return config?.actions?.autoCreateIssues !== false;
}

export function getGitHubRequirementText(actionMode) {
  if (actionMode === 'pull_request') {
    return 'fine-grained PAT with Pull requests: Read/Write and Contents: Read/Write';
  }
  return 'fine-grained PAT with Issues: Read/Write and Contents: Read';
}

export function getGitHubConnectionSummary(actionMode) {
  if (actionMode === 'pull_request') {
    return 'GitHub auth, repository access, pull-request API read checks, and default-branch metadata checks passed';
  }
  return 'GitHub auth, repository access, and issues API read checks passed';
}

export function getGitHubActionNoun(actionMode) {
  return actionMode === 'pull_request' ? 'pull requests' : 'issues';
}
