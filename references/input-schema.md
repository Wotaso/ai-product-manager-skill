# Input Schema

The analyzer accepts multiple JSON shapes.
Preferred order:

1. shared `signals[]`
2. crash-style `issues[]`
3. feedback-style `items[]`

## Shared `signals[]`

Use this for analytics, revenue, store, and custom connectors:

```json
{
  "project": "my-mobile-app",
  "window": "last_30d",
  "signals": [
    {
      "id": "retention_d3_drop",
      "title": "Day-3 retention dropped after onboarding paywall changes",
      "area": "onboarding",
      "priority": "high",
      "metric": "d3_retention",
      "current_value": 0.18,
      "baseline_value": 0.27,
      "delta_percent": -33.3,
      "evidence": [
        "Drop started after release 1.4.2",
        "Largest loss between onboarding step 2 and paywall view"
      ],
      "suggested_actions": [
        "Move paywall after first core value event",
        "Simplify onboarding step 2 form"
      ],
      "keywords": ["onboarding", "paywall", "trial"]
    }
  ]
}
```

## Crash `issues[]`

Works for Sentry, GlitchTip, Crashlytics-style exports:

```json
{
  "issues": [
    {
      "id": "glitchtip_1431",
      "title": "TypeError in paywall purchase callback",
      "priority": "high",
      "impact": "Conversion blocker in purchase flow",
      "events": 312,
      "users": 119,
      "stack_keywords": ["paywall", "purchase", "subscription", "callback"],
      "evidence": ["Crash occurs within 3s after paywall shown"]
    }
  ]
}
```

## Feedback `items[]`

Works for support, app reviews, in-app feedback, store review exports:

```json
{
  "window": "last_30d",
  "items": [
    {
      "id": "fb_onboarding_too_long",
      "title": "Onboarding feels too long before first value",
      "area": "onboarding",
      "priority": "medium",
      "count": 14,
      "channel": "support_tickets",
      "comment": "Users ask for a faster path to first result",
      "locations": [
        { "location_id": "onboarding/profile_step", "count": 9 },
        { "location_id": "onboarding/permissions_gate", "count": 5 }
      ],
      "keywords": ["onboarding", "friction", "first value"]
    }
  ]
}
```

## Extra Connectors

For `sources.extra[]`, the connector key becomes the source label in generated output.

Examples:

- `glitchtip`
- `asc_cli`
- `app_store_reviews`
- `play_console`

If your connector can already emit shared `signals[]`, use that shape. It is the least ambiguous path.

## ASC Analytics Payloads

The built-in ASC exporter can attach App Store Connect Analytics context under `meta.analytics`.
Use it for production growth/stability checks, not TestFlight crash triage.

Expected fields:

```json
{
  "project": "app-store-connect:123456789",
  "window": "latest",
  "signals": [
    {
      "id": "asc_production_crashes_detected",
      "area": "crash",
      "metric": "asc_total_crashes",
      "current_value": 3
    }
  ],
  "meta": {
    "source": "asc",
    "analyticsWindow": { "start": "2026-04-04", "end": "2026-05-03" },
    "analytics": {
      "units": { "total": 100, "previousTotal": 160, "percentChange": -0.375 },
      "redownloads": { "total": 12, "previousTotal": 10, "percentChange": 0.2 },
      "conversionRate": { "total": 4.5, "previousTotal": 6.2, "percentChange": -0.274 },
      "crashRate": {
        "total": 1.1,
        "previousTotal": 0,
        "percentChange": 1,
        "nonZeroDays": [{ "date": "2026-05-03", "value": 1.1 }]
      },
      "totalCrashes": 3,
      "crashBreakdown": [{ "label": "1.0.0 (iOS)", "value": 3 }],
      "sourceBreakdown": [
        { "title": "App Store Search", "pageViewUnique": 90 },
        { "title": "Web Referrer", "pageViewUnique": 10 }
      ],
      "overviewMetricCatalog": [
        {
          "section": "acquisition",
          "measure": "pageViewCount",
          "total": 80,
          "previousTotal": 120,
          "percentChange": -0.333,
          "type": "COUNT"
        }
      ]
    }
  }
}
```

Rules for recommendations:

- alert daily on non-zero production total crashes
- compare ASC crash totals with Sentry production issues/events/users when Sentry is connected
- if ASC web analytics auth is missing, tell the user to run `asc web auth login` and verify with `asc web auth status --output json --pretty`
- inspect `overviewMetricCatalog` so recommendations use all available ASC metrics, not only units/conversion/source traffic
- treat ASC sources as unique product page views by source, not download units by source
- turn source mix into Handlungsempfehlungen only after comparing units/downloads and conversion
