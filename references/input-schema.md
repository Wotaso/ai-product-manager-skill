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
