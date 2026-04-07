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
