# Input Schema (MVP)

The analyzer accepts flexible JSON, but this shape is recommended for reliable issue quality.

## `analytics_summary.json` (required)

```json
{
  "project": "my-product",
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

## `revenuecat_summary.json` (recommended)

```json
{
  "signals": [
    {
      "id": "trial_to_paid_down",
      "title": "Trial-to-paid conversion dropped in weekly package",
      "area": "paywall",
      "priority": "high",
      "metric": "trial_to_paid",
      "current_value": 0.08,
      "baseline_value": 0.12,
      "delta_percent": -33.0,
      "evidence": ["Drop is strongest on iOS and onboarding entry paywall"],
      "keywords": ["subscription", "pricing", "trial", "weekly"]
    }
  ]
}
```

## `sentry_summary.json` (recommended)

```json
{
  "issues": [
    {
      "id": "sentry_1431",
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

## `feedback_summary.json` (optional)

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
      "keywords": ["onboarding", "friction", "first value"]
    }
  ]
}
```
