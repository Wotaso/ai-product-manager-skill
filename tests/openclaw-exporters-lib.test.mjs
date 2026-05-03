import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalyticsSummary,
  buildAscSummary,
  buildRevenueCatSummary,
  buildSentrySummary,
} from '../scripts/openclaw-exporters-lib.mjs';

test('buildAnalyticsSummary emits onboarding, paywall, and retention signals from weak funnel data', () => {
  const summary = buildAnalyticsSummary({
    projectId: 'project-123',
    last: '30d',
    onboardingJourney: {
      starters: 200,
      completedUsers: 72,
      completionRate: 36,
      paywallReachedUsers: 120,
      paywallSkippedUsers: 84,
      paywallSkipRateFromPaywall: 70,
      purchasedUsers: 8,
      purchaseRateFromPaywall: 6.67,
      paywallAnchorEvent: 'paywall:shown',
      paywallSkipEvent: 'paywall:skip',
      purchaseEvent: 'purchase:success',
      trends: {
        completionRate: {
          direction: 'down',
          percentChange: -18.5,
          startValue: 44,
          currentValue: 36,
        },
      },
    },
    retention: {
      cohortSize: 180,
      avgActiveDays: 2.7,
      days: [
        { day: 1, retainedUsers: 70, retentionRate: 0.39 },
        { day: 3, retainedUsers: 24, retentionRate: 0.13 },
        { day: 7, retainedUsers: 12, retentionRate: 0.067 },
      ],
    },
    maxSignals: 4,
  });

  assert.equal(summary.project, 'project-123');
  assert.equal(summary.window, 'last_30d');
  assert.equal(summary.signals.length, 4);
  assert.deepEqual(
    summary.signals.map((signal) => signal.id),
    [
      'paywall_skip_rate_above_target',
      'onboarding_completion_below_target',
      'retention_d7_below_target',
      'paywall_purchase_rate_below_target',
    ],
  );
});

test('buildAscSummary emits release blocker, rating, and review-theme signals', () => {
  const summary = buildAscSummary({
    appId: '123456789',
    statusPayload: {
      submission: {
        latest: {
          status: 'REJECTED',
        },
      },
      builds: {
        latest: {
          processingState: 'PROCESSING',
        },
      },
    },
    ratingsPayload: {
      averageRating: 3.7,
      ratingCount: 142,
    },
    reviewSummariesPayload: {
      data: [
        { attributes: { text: 'Users mention crashes and subscription pricing confusion.' } },
        { attributes: { text: 'Crashing after purchase and unclear paywall copy.' } },
      ],
    },
    feedbackPayload: {
      data: [
        { attributes: { feedback: 'Login feels broken and the app freezes.' } },
      ],
    },
    maxSignals: 4,
  });

  assert.equal(summary.project, 'app-store-connect:123456789');
  assert.equal(summary.window, 'latest');
  assert.equal(summary.signals.length, 4);
  assert.equal(summary.signals[0].id, 'asc_release_blockers_detected');
  assert(summary.signals.some((signal) => signal.id === 'asc_rating_below_target'));
  assert(summary.signals.some((signal) => signal.id === 'asc_review_theme_stability'));
  assert(summary.signals.some((signal) => signal.id === 'asc_review_theme_pricing'));
});

test('buildRevenueCatSummary emits live metrics and catalog signals', () => {
  const summary = buildRevenueCatSummary({
    project: { id: 'proj_123', name: 'Flashes' },
    overviewPayload: {
      metrics: [
        { id: 'revenue', name: 'Revenue', value: 1240 },
        { id: 'active_trials', name: 'Active Trials', value: 34 },
      ],
    },
    appsPayload: { items: [{ id: 'app_1', name: 'Flashes iOS' }] },
    productsPayload: { items: [{ id: 'prod_1', store_identifier: 'premium_monthly' }] },
    offeringsPayload: { items: [{ id: 'offering_1', display_name: 'Default' }] },
    entitlementsPayload: { items: [{ id: 'entitlement_1', display_name: 'Premium' }] },
    maxSignals: 4,
  });

  assert.equal(summary.project, 'revenuecat:proj_123');
  assert.equal(summary.meta.source, 'revenuecat');
  assert.equal(summary.meta.productsCount, 1);
  assert(summary.signals.some((signal) => signal.id === 'revenuecat_overview_metrics_available'));
  assert(summary.signals.some((signal) => signal.id === 'revenuecat_catalog_summary'));
});

test('buildSentrySummary emits crash issues and signals from unresolved issues', () => {
  const summary = buildSentrySummary({
    org: 'wotaso',
    project: 'flashes',
    environment: 'production',
    last: '7d',
    issuesPayload: [
      {
        id: '123',
        shortId: 'FLASHES-1',
        title: 'TypeError: cannot read property paywallPackage',
        level: 'error',
        count: 42,
        userCount: 11,
        firstSeen: '2026-05-01T00:00:00Z',
        lastSeen: '2026-05-03T00:00:00Z',
        culprit: 'PaywallScreen',
        permalink: 'https://sentry.io/issues/123',
      },
    ],
    maxSignals: 3,
  });

  assert.equal(summary.project, 'sentry:wotaso/flashes');
  assert.equal(summary.meta.source, 'sentry');
  assert.equal(summary.issues.length, 1);
  assert.equal(summary.issues[0].id, '123');
  assert.equal(summary.issues[0].priority, 'medium');
  assert.equal(summary.signals[0].area, 'crash');
  assert(summary.signals[0].evidence.some((entry) => entry.includes('FLASHES-1')));
});
