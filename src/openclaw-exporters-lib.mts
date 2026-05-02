import { promises as fs } from 'node:fs';
import path from 'node:path';

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function coerceRatioFromPercent(value) {
  const numeric = coerceNumber(value);
  if (numeric === null) return null;
  return numeric / 100;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function computeDeltaPercent(currentValue, baselineValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
    return null;
  }
  if (Math.abs(baselineValue) < 1e-9) {
    if (Math.abs(currentValue) < 1e-9) return 0;
    return currentValue > 0 ? 100 : -100;
  }
  return round(((currentValue - baselineValue) / Math.abs(baselineValue)) * 100, 2);
}

function normalizeWindow(last) {
  const normalized = String(last || '30d').trim().toLowerCase();
  if (!normalized) return 'last_30d';
  if (normalized.startsWith('last_')) return normalized;
  return `last_${normalized}`;
}

function priorityRank(priority) {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function sortSignals(signals) {
  return [...signals].sort((a, b) => {
    const priorityDelta = priorityRank(String(b.priority || 'low')) - priorityRank(String(a.priority || 'low'));
    if (priorityDelta !== 0) return priorityDelta;
    const deltaA = Math.abs(coerceNumber(a.delta_percent ?? a.deltaPercent) || 0);
    const deltaB = Math.abs(coerceNumber(b.delta_percent ?? b.deltaPercent) || 0);
    return deltaB - deltaA;
  });
}

function hasMinimumSample(value, minimum = 20) {
  const numeric = coerceNumber(value);
  return numeric !== null && numeric >= minimum;
}

function maybePushSignal(signals, signal) {
  if (!signal) return;
  signals.push(signal);
}

function buildAnalyticsTrendEvidence(label, trend) {
  if (!trend || typeof trend !== 'object') return null;
  const direction = String(trend.direction || '').trim();
  const percentChange = coerceNumber(trend.percentChange);
  const startValue = coerceNumber(trend.startValue);
  const currentValue = coerceNumber(trend.currentValue);
  if (!direction || percentChange === null || startValue === null || currentValue === null) {
    return null;
  }
  const signed = percentChange > 0 ? `+${percentChange}%` : `${percentChange}%`;
  return `${label} trend: ${direction} ${signed} (start=${startValue}, current=${currentValue})`;
}

export function buildAnalyticsSummary(input) {
  const last = String(input?.last || '30d');
  const onboardingJourney = input?.onboardingJourney || null;
  const retention = input?.retention || null;
  const project =
    String(
      onboardingJourney?.projectId ||
        input?.projectId ||
        input?.project ||
        'analyticscli-project',
    ).trim() || 'analyticscli-project';

  const signals = [];
  const starters = coerceNumber(onboardingJourney?.starters) || 0;
  const paywallReachedUsers = coerceNumber(onboardingJourney?.paywallReachedUsers) || 0;

  const completionRate = coerceRatioFromPercent(onboardingJourney?.completionRate);
  const paywallSkipRate = coerceRatioFromPercent(onboardingJourney?.paywallSkipRateFromPaywall);
  const purchaseRateFromPaywall = coerceRatioFromPercent(onboardingJourney?.purchaseRateFromPaywall);

  if (hasMinimumSample(starters)) {
    const completionBaseline = 0.6;
    if (completionRate !== null && completionRate < completionBaseline) {
      maybePushSignal(signals, {
        id: 'onboarding_completion_below_target',
        title: 'Onboarding completion rate is below target',
        area: 'onboarding',
        priority: completionRate < 0.45 ? 'high' : 'medium',
        metric: 'onboarding_completion_rate',
        current_value: round(completionRate),
        baseline_value: completionBaseline,
        delta_percent: computeDeltaPercent(completionRate, completionBaseline),
        evidence: [
          `${onboardingJourney?.completedUsers || 0} of ${starters} onboarding starters completed successfully`,
          onboardingJourney?.paywallAnchorEvent
            ? `Paywall anchor event in the flow: ${onboardingJourney.paywallAnchorEvent}`
            : 'No stable paywall anchor event detected in the onboarding journey payload',
          buildAnalyticsTrendEvidence('Completion rate', onboardingJourney?.trends?.completionRate),
        ].filter(Boolean),
        suggested_actions: [
          'Shorten the onboarding path before the first value moment',
          'Delay monetization or permission friction until after the first core success event',
          'Inspect the heaviest drop-off steps in the onboarding journey and simplify one of them',
        ],
        keywords: ['onboarding', 'completion', 'dropoff', 'first_value'],
      });
    }
  }

  if (hasMinimumSample(paywallReachedUsers)) {
    const paywallSkipBaseline = 0.45;
    if (paywallSkipRate !== null && paywallSkipRate > paywallSkipBaseline) {
      maybePushSignal(signals, {
        id: 'paywall_skip_rate_above_target',
        title: 'Paywall skip rate is above target',
        area: 'paywall',
        priority: paywallSkipRate > 0.6 ? 'high' : 'medium',
        metric: 'paywall_skip_rate',
        current_value: round(paywallSkipRate),
        baseline_value: paywallSkipBaseline,
        delta_percent: computeDeltaPercent(paywallSkipRate, paywallSkipBaseline),
        evidence: [
          `${onboardingJourney?.paywallSkippedUsers || 0} users skipped after ${paywallReachedUsers} reached the paywall`,
          onboardingJourney?.paywallSkipEvent
            ? `Most visible skip event: ${onboardingJourney.paywallSkipEvent}`
            : 'No stable skip event detected in the onboarding journey payload',
          buildAnalyticsTrendEvidence('Paywall reached rate', onboardingJourney?.trends?.paywallReachedRate),
        ].filter(Boolean),
        suggested_actions: [
          'Clarify the premium value proposition and annual-vs-monthly trade-off',
          'Reduce cognitive load on the first paywall view and tighten the CTA hierarchy',
          'Test a later paywall placement after a stronger proof-of-value moment',
        ],
        keywords: ['paywall', 'skip', 'pricing', 'conversion'],
      });
    }

    const purchaseBaseline = 0.12;
    if (purchaseRateFromPaywall !== null && purchaseRateFromPaywall < purchaseBaseline) {
      maybePushSignal(signals, {
        id: 'paywall_purchase_rate_below_target',
        title: 'Paywall-to-purchase conversion is below target',
        area: 'conversion',
        priority: purchaseRateFromPaywall < 0.06 ? 'high' : 'medium',
        metric: 'purchase_rate_from_paywall',
        current_value: round(purchaseRateFromPaywall),
        baseline_value: purchaseBaseline,
        delta_percent: computeDeltaPercent(purchaseRateFromPaywall, purchaseBaseline),
        evidence: [
          `${onboardingJourney?.purchasedUsers || 0} purchases from ${paywallReachedUsers} paywall exposures`,
          onboardingJourney?.purchaseEvent
            ? `Purchase success event observed: ${onboardingJourney.purchaseEvent}`
            : 'No stable purchase success event detected in the onboarding journey payload',
          buildAnalyticsTrendEvidence('Purchase rate', onboardingJourney?.trends?.purchaseRate),
        ].filter(Boolean),
        suggested_actions: [
          'Simplify the paywall package comparison and highlight the default recommended offer',
          'Reduce ambiguity around trial terms, pricing cadence, and restore flow',
          'Test a stronger trust/benefit section near the purchase CTA',
        ],
        keywords: ['purchase', 'paywall', 'subscription', 'conversion'],
      });
    }
  }

  const retentionByDay = new Map<number, number>(
    Array.isArray(retention?.days)
      ? retention.days
          .map((entry) => {
            const day = coerceNumber(entry?.day);
            const rate = coerceNumber(entry?.retentionRate);
            if (day === null || rate === null) return null;
            return [day, rate] as [number, number];
          })
          .filter((entry): entry is [number, number] => entry !== null)
      : [],
  );

  const retentionTargets = [
    { day: 7, baseline: 0.1 },
    { day: 3, baseline: 0.2 },
    { day: 1, baseline: 0.35 },
  ];

  if (hasMinimumSample(retention?.cohortSize)) {
    for (const target of retentionTargets) {
      const actual = retentionByDay.get(target.day);
      if (actual === undefined || actual >= target.baseline) {
        continue;
      }

      maybePushSignal(signals, {
        id: `retention_d${target.day}_below_target`,
        title: `Day-${target.day} retention is below target`,
        area: 'retention',
        priority: target.day >= 3 ? 'high' : 'medium',
        metric: `d${target.day}_retention`,
        current_value: round(actual),
        baseline_value: target.baseline,
        delta_percent: computeDeltaPercent(actual, target.baseline),
        evidence: [
          `Retention cohort size: ${retention.cohortSize}`,
          `Observed D${target.day} retention: ${(actual * 100).toFixed(2)}%`,
          retention?.avgActiveDays !== undefined
            ? `Average active days in the cohort: ${retention.avgActiveDays}`
            : null,
        ].filter(Boolean),
        suggested_actions: [
          'Revisit the first-session value loop and ensure the core action completes quickly',
          'Add targeted re-entry prompts or reminders after the first session',
          'Instrument the major early-session drop-off points to isolate which step drives the retention loss',
        ],
        keywords: ['retention', 'engagement', 'activation', `d${target.day}`],
      });
      break;
    }
  }

  return {
    project,
    window: normalizeWindow(last),
    signals: sortSignals(signals).slice(0, Math.max(1, Number(input?.maxSignals) || 4)),
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'analyticscli',
      starters,
      paywallReachedUsers,
      retentionCohortSize: coerceNumber(retention?.cohortSize) || 0,
    },
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function walk(value, visitor, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      walk(entry, visitor, [...pathParts, String(index)]);
    });
    return;
  }

  if (!isObject(value)) {
    visitor(value, pathParts);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    visitor(entry, nextPath, key);
    walk(entry, visitor, nextPath);
  }
}

function collectStatusEntries(payload) {
  const entries = [];
  walk(payload, (value, pathParts, key) => {
    if (typeof value !== 'string') return;
    const normalizedKey = String(key || '').toLowerCase();
    if (!['state', 'status', 'processingstate', 'reviewstate'].includes(normalizedKey)) {
      return;
    }
    entries.push({
      path: pathParts.join('.'),
      value: value.trim(),
    });
  });
  return entries;
}

function classifyAscStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;

  if (/(reject|rejected|fail|failed|error|invalid|missing|remove|blocked|denied|cancel)/.test(normalized)) {
    return 'blocking';
  }

  if (/(processing|pending|waiting|prepare_for_submission|ready_for_review|in_review)/.test(normalized)) {
    return 'watch';
  }

  if (/(ready_for_sale|approved|active|available|complete|passed|ok)/.test(normalized)) {
    return 'healthy';
  }

  return null;
}

function findNumbersByCandidateKeys(payload, candidateKeys) {
  const matches = [];
  walk(payload, (value, pathParts, key) => {
    if (!key) return;
    const normalizedKey = String(key).toLowerCase();
    if (!candidateKeys.includes(normalizedKey)) return;
    const numeric = coerceNumber(value);
    if (numeric === null) return;
    matches.push({ path: pathParts.join('.'), value: numeric });
  });
  return matches;
}

function extractReviewTexts(payload) {
  const texts = [];
  walk(payload, (value, pathParts, key) => {
    if (typeof value !== 'string') return;
    const normalizedKey = String(key || '').toLowerCase();
    if (!['text', 'comment', 'summary', 'body', 'title', 'feedback'].includes(normalizedKey)) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    texts.push({
      path: pathParts.join('.'),
      text: trimmed,
    });
  });
  return texts;
}

function rankKeywordThemes(texts) {
  const themeDefinitions = [
    {
      id: 'stability',
      area: 'stability',
      keywords: ['crash', 'crashes', 'crashing', 'freeze', 'frozen', 'bug', 'broken'],
      suggestedActions: [
        'Review recent crash and review signals together to isolate the highest-impact regression',
        'Prioritize the failing flow in the next patch release and add deterministic regression coverage',
      ],
    },
    {
      id: 'pricing',
      area: 'paywall',
      keywords: ['subscription', 'subscribe', 'paywall', 'price', 'pricing', 'trial', 'premium', 'restore'],
      suggestedActions: [
        'Clarify package differences and restore messaging in the paywall flow',
        'Use review phrasing directly to rewrite confusing pricing copy',
      ],
    },
    {
      id: 'auth',
      area: 'authentication',
      keywords: ['login', 'log in', 'sign in', 'account', 'password'],
      suggestedActions: [
        'Audit authentication entry points and reduce avoidable sign-in friction',
        'Surface clearer account state and recovery messaging in the first-session path',
      ],
    },
    {
      id: 'onboarding',
      area: 'onboarding',
      keywords: ['onboarding', 'tutorial', 'signup', 'sign up', 'permission', 'too long'],
      suggestedActions: [
        'Trim the onboarding path and move optional steps later',
        'Match onboarding copy more closely to the first-value promise from the store listing',
      ],
    },
    {
      id: 'performance',
      area: 'performance',
      keywords: ['slow', 'lag', 'loading', 'stuck', 'wait'],
      suggestedActions: [
        'Measure the slowest startup and primary interaction paths that users mention',
        'Ship a focused performance pass on the worst-loading user journeys',
      ],
    },
  ];

  return themeDefinitions
    .map((theme) => {
      let hits = 0;
      for (const entry of texts) {
        const normalized = entry.text.toLowerCase();
        for (const keyword of theme.keywords) {
          if (normalized.includes(keyword)) {
            hits += 1;
          }
        }
      }
      return { ...theme, hits };
    })
    .filter((theme) => theme.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

export function buildAscSummary(input) {
  const appId = String(input?.appId || 'ASC_APP_ID').trim() || 'ASC_APP_ID';
  const statusEntries = collectStatusEntries(input?.statusPayload);
  const blockingStatuses = statusEntries.filter((entry) => classifyAscStatus(entry.value) === 'blocking');
  const watchStatuses = statusEntries.filter((entry) => classifyAscStatus(entry.value) === 'watch');

  const averageRatingCandidates = findNumbersByCandidateKeys(input?.ratingsPayload, [
    'averagerating',
    'averageuserrating',
    'ratingaverage',
    'avgrating',
  ]).filter((entry) => entry.value >= 0 && entry.value <= 5);
  const ratingCountCandidates = findNumbersByCandidateKeys(input?.ratingsPayload, [
    'ratingcount',
    'userratingcount',
    'ratingscount',
    'count',
  ]).filter((entry) => entry.value >= 0);

  const averageRating = averageRatingCandidates[0]?.value ?? null;
  const ratingCount = ratingCountCandidates[0]?.value ?? null;

  const reviewTexts = [
    ...extractReviewTexts(input?.reviewSummariesPayload),
    ...extractReviewTexts(input?.feedbackPayload),
  ];
  const topThemes = rankKeywordThemes(reviewTexts).slice(0, 2);

  const signals = [];

  if (blockingStatuses.length > 0) {
    maybePushSignal(signals, {
      id: 'asc_release_blockers_detected',
      title: 'App Store Connect reports blocking release states',
      area: 'release',
      priority: 'high',
      metric: 'asc_release_blockers',
      current_value: blockingStatuses.length,
      baseline_value: 0,
      delta_percent: blockingStatuses.length > 0 ? 100 : 0,
      evidence: blockingStatuses.slice(0, 5).map((entry) => `${entry.path}: ${entry.value}`),
      suggested_actions: [
        'Open the failing ASC section and resolve the blocking review, submission, or build issue',
        'Link the blocking ASC state to the corresponding release checklist item before the next submission',
      ],
      keywords: ['asc', 'review', 'submission', 'release', 'blocker'],
    });
  } else if (watchStatuses.length > 0) {
    maybePushSignal(signals, {
      id: 'asc_release_in_progress',
      title: 'App Store Connect still shows in-progress release states',
      area: 'release',
      priority: 'medium',
      metric: 'asc_release_watch_states',
      current_value: watchStatuses.length,
      baseline_value: 0,
      delta_percent: watchStatuses.length > 0 ? 100 : 0,
      evidence: watchStatuses.slice(0, 5).map((entry) => `${entry.path}: ${entry.value}`),
      suggested_actions: [
        'Monitor build processing and review transitions until they reach a terminal healthy state',
        'Avoid scheduling a coordinated release action until ASC processing has finished',
      ],
      keywords: ['asc', 'processing', 'review', 'submission'],
    });
  }

  if (averageRating !== null && ratingCount !== null && ratingCount >= 20 && averageRating < 4.2) {
    const ratingBaseline = 4.2;
    maybePushSignal(signals, {
      id: 'asc_rating_below_target',
      title: 'App Store rating is below target',
      area: 'store',
      priority: averageRating < 3.8 ? 'high' : 'medium',
      metric: 'app_store_average_rating',
      current_value: round(averageRating),
      baseline_value: ratingBaseline,
      delta_percent: computeDeltaPercent(averageRating, ratingBaseline),
      evidence: [
        `Average rating: ${averageRating.toFixed(2)} from ${Math.round(ratingCount)} ratings`,
        'Ratings came from the ASC review ratings command output',
      ],
      suggested_actions: [
        'Read recent review summaries to identify the dominant complaint before changing store copy',
        'Tie the next release notes and onboarding/paywall adjustments to the main rating complaint themes',
      ],
      keywords: ['app_store', 'rating', 'reviews', 'aso'],
    });
  }

  for (const theme of topThemes) {
    maybePushSignal(signals, {
      id: `asc_review_theme_${theme.id}`,
      title: `Store and beta feedback repeatedly mention ${theme.area} issues`,
      area: theme.area,
      priority: theme.hits >= 4 ? 'high' : 'medium',
      metric: `feedback_theme_${theme.id}`,
      current_value: theme.hits,
      baseline_value: 0,
      delta_percent: theme.hits > 0 ? 100 : 0,
      evidence: reviewTexts.slice(0, 3).map((entry) => entry.text).filter(Boolean),
      suggested_actions: theme.suggestedActions,
      keywords: ['reviews', 'feedback', theme.area, ...theme.keywords.slice(0, 3)],
    });
  }

  return {
    project: `app-store-connect:${appId}`,
    window: 'latest',
    signals: sortSignals(signals).slice(0, Math.max(1, Number(input?.maxSignals) || 4)),
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'asc',
      appId,
      ratingCount: ratingCount ?? 0,
      feedbackTextCount: reviewTexts.length,
    },
  };
}

function extractListItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function displayName(value) {
  return String(
    value?.display_name ||
      value?.displayName ||
      value?.name ||
      value?.store_identifier ||
      value?.lookup_key ||
      value?.id ||
      '',
  ).trim();
}

function metricValueById(metrics, candidateIds) {
  const candidates = new Set(candidateIds.map((id) => String(id).toLowerCase()));
  for (const metric of metrics) {
    const id = String(metric?.id || metric?.name || '').toLowerCase();
    if (!candidates.has(id)) continue;
    const value = coerceNumber(metric?.value);
    if (value !== null) return { id, value, metric };
  }
  return null;
}

export function buildRevenueCatSummary(input) {
  const projectId = String(input?.projectId || input?.project?.id || 'revenuecat-project').trim() || 'revenuecat-project';
  const projectName = displayName(input?.project) || projectId;
  const apps = extractListItems(input?.appsPayload);
  const products = extractListItems(input?.productsPayload);
  const offerings = extractListItems(input?.offeringsPayload);
  const entitlements = extractListItems(input?.entitlementsPayload);
  const metrics = Array.isArray(input?.overviewPayload?.metrics) ? input.overviewPayload.metrics : [];
  const warnings = Array.isArray(input?.warnings) ? input.warnings.filter(Boolean) : [];

  const signals = [];
  const revenueMetric = metricValueById(metrics, ['revenue', 'mrr', 'arr', 'new_revenue', 'monthly_recurring_revenue']);
  const activeTrialsMetric = metricValueById(metrics, ['active_trials']);
  const activeSubscriptionsMetric = metricValueById(metrics, ['active_subscriptions', 'actives']);
  const churnMetric = metricValueById(metrics, ['churn', 'churn_rate']);

  if (revenueMetric || activeSubscriptionsMetric || activeTrialsMetric) {
    maybePushSignal(signals, {
      id: 'revenuecat_overview_metrics_available',
      title: 'RevenueCat overview metrics are connected',
      area: 'revenue',
      priority: 'medium',
      metric: revenueMetric?.id || activeSubscriptionsMetric?.id || activeTrialsMetric?.id || 'revenuecat_metrics',
      current_value: revenueMetric?.value ?? activeSubscriptionsMetric?.value ?? activeTrialsMetric?.value ?? 0,
      baseline_value: null,
      delta_percent: null,
      evidence: [
        revenueMetric ? `${revenueMetric.metric?.name || revenueMetric.id}: ${revenueMetric.value}` : null,
        activeSubscriptionsMetric ? `${activeSubscriptionsMetric.metric?.name || activeSubscriptionsMetric.id}: ${activeSubscriptionsMetric.value}` : null,
        activeTrialsMetric ? `${activeTrialsMetric.metric?.name || activeTrialsMetric.id}: ${activeTrialsMetric.value}` : null,
      ].filter(Boolean),
      suggested_actions: [
        'Compare RevenueCat movement with AnalyticsCLI paywall and purchase funnel signals',
        'Use product and entitlement metadata to verify the paid path users see in the app',
      ],
      keywords: ['revenuecat', 'revenue', 'subscription', 'metrics'],
    });
  }

  if (churnMetric && churnMetric.value > 0) {
    maybePushSignal(signals, {
      id: 'revenuecat_churn_visible',
      title: 'RevenueCat reports churn movement',
      area: 'retention',
      priority: churnMetric.value >= 10 ? 'high' : 'medium',
      metric: churnMetric.id,
      current_value: churnMetric.value,
      baseline_value: 0,
      delta_percent: 100,
      evidence: [`${churnMetric.metric?.name || churnMetric.id}: ${churnMetric.value}`],
      suggested_actions: [
        'Inspect cancellation timing against onboarding and first-week retention signals',
        'Prioritize paywall promise and subscription value alignment if churn clusters after trial or first renewal',
      ],
      keywords: ['revenuecat', 'churn', 'subscription', 'retention'],
    });
  }

  if (products.length === 0 || offerings.length === 0 || entitlements.length === 0) {
    maybePushSignal(signals, {
      id: 'revenuecat_catalog_incomplete',
      title: 'RevenueCat product catalog looks incomplete',
      area: 'paywall',
      priority: products.length === 0 || offerings.length === 0 ? 'high' : 'medium',
      metric: 'revenuecat_catalog_entities',
      current_value: products.length + offerings.length + entitlements.length,
      baseline_value: 3,
      delta_percent: computeDeltaPercent(products.length + offerings.length + entitlements.length, 3),
      evidence: [
        `Products: ${products.length}`,
        `Offerings: ${offerings.length}`,
        `Entitlements: ${entitlements.length}`,
      ],
      suggested_actions: [
        'Verify the app has at least one active product, entitlement, and offering in RevenueCat',
        'Check that App Store Connect product identifiers match the RevenueCat products used by the app',
      ],
      keywords: ['revenuecat', 'products', 'offerings', 'entitlements', 'paywall'],
    });
  } else {
    maybePushSignal(signals, {
      id: 'revenuecat_catalog_summary',
      title: 'RevenueCat catalog is available for monetization analysis',
      area: 'paywall',
      priority: 'low',
      metric: 'revenuecat_products',
      current_value: products.length,
      baseline_value: 1,
      delta_percent: computeDeltaPercent(products.length, 1),
      evidence: [
        `Apps: ${apps.length}`,
        `Products: ${products.slice(0, 5).map(displayName).filter(Boolean).join(', ') || products.length}`,
        `Offerings: ${offerings.slice(0, 5).map(displayName).filter(Boolean).join(', ') || offerings.length}`,
        `Entitlements: ${entitlements.slice(0, 5).map(displayName).filter(Boolean).join(', ') || entitlements.length}`,
      ],
      suggested_actions: [
        'Use this catalog context when evaluating paywall copy, package order, and entitlement naming',
        'Cross-check product availability with ASC if users report unavailable purchases',
      ],
      keywords: ['revenuecat', 'catalog', 'products', 'offerings', 'entitlements'],
    });
  }

  return {
    project: `revenuecat:${projectId}`,
    window: 'latest',
    signals: sortSignals(signals).slice(0, Math.max(1, Number(input?.maxSignals) || 4)),
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'revenuecat',
      projectId,
      projectName,
      appsCount: apps.length,
      productsCount: products.length,
      offeringsCount: offerings.length,
      entitlementsCount: entitlements.length,
      metricsCount: metrics.length,
      warnings,
    },
  };
}

export async function writeJsonOutput(outPath, payload) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (outPath) {
    const resolved = path.resolve(String(outPath));
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, serialized, 'utf8');
    return resolved;
  }

  process.stdout.write(serialized);
  return null;
}
