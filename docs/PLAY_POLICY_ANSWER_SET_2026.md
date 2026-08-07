# Google Play Policy Answer Set — Astroloji

- **Effective date:** 2026-08-06
- **Package:** `com.parsfilo.astrology`
- **Developer identity:** ParsFilo
- **Canonical store configuration:** `Astroloji/play/store-config.json`
- **Engineering data matrix:** `docs/DATA_SAFETY_2026.md`
- **Operational rule:** Read current Play Console values first. Save only when the page state, shipped artifact, engineering evidence, and this answer set agree.

## Canonical answers

- Account deletion: Supported
- Account deletion URL: https://astrology.parsfilo.com/delete-account
- Privacy policy: https://astrology.parsfilo.com/privacy
- Ads: Yes
- Purchases: Google Play subscriptions
- Data deletion request: Available in app
- Optional date of birth: Collected ephemerally for app functionality

## Console operator table

| Console section | Exact answer or action | Engineering evidence | Save condition |
|---|---|---|---|
| Developer name | ParsFilo | Store config and public brand | Public page preview shows ParsFilo |
| Support e-mail | info@parsfilo.com | ParsFilo domain identity | A test message is delivered and a reply is received before publication |
| Website | https://astrology.parsfilo.com | Production site | HTTPS 200 and no redirect to another brand |
| Privacy policy | https://astrology.parsfilo.com/privacy | Production privacy route | HTTPS 200 and content covers active SDKs |
| Account deletion | Supported; in-app deletion is available | Settings flow and physical-device smoke | Public Play page shows that account deletion is supported |
| Account deletion URL | https://astrology.parsfilo.com/delete-account | Public backend route | HTTPS 200 and instructions match the app |
| Ads | Yes | Google Mobile Ads SDK, AdMob app, and six ad units | UMP and advertising declarations remain enabled |
| App access | No access instructions required for review | Anonymous Firebase onboarding; no reviewer credential gate | Fresh install reaches the core experience without supplied credentials |
| Purchases | Google Play subscriptions | BillingClient and backend verification | Products remain `premium_monthly`/`monthly` and `premium_weekly`/`weekly` |
| Data: date of birth | Optional, collected ephemerally for app functionality | Personal Guidance request; not persisted | No analytics, D1, preference, or log storage exists |
| Data: app interactions | Collected for analytics | Firebase Analytics and bounded event allowlist | No free-form or direct identifiers in event parameters |
| Data: crash logs and diagnostics | Collected for analytics and app stability | Firebase Crashlytics | Provider disclosure and retention reviewed |
| Data: device or other IDs | Collected for app functionality, analytics, notifications, and advertising | Firebase Installation ID, FCM, Mobile Ads/UMP | Advertising and notification purposes remain declared |
| Data: purchase history | Collected for app functionality, fraud prevention, and account management | Play purchase token and subscription state | Account-linked app records are removed on account deletion subject to provider or legal retention |
| Data deletion request | Available in the app and through the public deletion page | Settings deletion flow and public route | Both paths are reachable in the release artifact |
| Target audience | Preserve current answer | No child-directed positioning in the artifact | Read-only snapshot matches the current production declaration |
| Content rating | Preserve current questionnaire answers | Existing PEGI 3 public rating | No new content category was added by metadata work |

## Active processor matrix

| Provider | Transmitted data categories | Purpose | Account-deletion behavior | Engineering or live evidence |
|---|---|---|---|---|
| Firebase Authentication | Anonymous account identifier, authentication state | Authentication and account security | Firebase identity is deleted after the authenticated app deletion flow succeeds | `SessionRepository`, backend Firebase deletion service, physical-device smoke |
| Firebase Analytics | Bounded app interactions and categorical event parameters | Product analytics and funnel measurement | Provider retention applies; app-linked backend event records are removed where supported | Analytics allowlist and `docs/DATA_SAFETY_2026.md` |
| Firebase Crashlytics | Crash logs, diagnostics, app/device context | Reliability and crash diagnosis | Provider retention and deletion capabilities apply | Crashlytics SDK configuration and Play Vitals review |
| Firebase Cloud Messaging | Installation identifier, platform, notification target token during migration | User-requested notifications | App-linked target association is removed on account deletion; provider lifecycle rules apply | FCM configuration and backend notification target flow |
| Firebase Remote Config | Installation context and configuration fetch metadata | Feature flags, ad limits, and safe release controls | Provider-managed retention applies | Remote Config template and Android repository |
| Firebase Installations | Firebase Installation ID and installation lifecycle metadata | Firebase service routing and installation identity | Local installation identity is removed during account deletion where supported; provider lifecycle rules apply | Physical-device smoke and Firebase SDK integration |
| Google Mobile Ads/UMP | Advertising or device signals and consent state | Ad delivery, consent, measurement, and fraud prevention | Provider-controlled retention applies; premium users do not preload ads | AdMob application, six ad units, UMP integration |
| Google Play Billing | Product ID, purchase token, subscription state, and expiry | Purchase, restore, entitlement, and fraud prevention | App-linked entitlement records are removed on account deletion subject to provider or legal retention; Play transaction history remains provider-controlled | BillingClient, backend verification, subscription tests |
| Google Play Developer API | Subscription and release metadata accessed by the backend or release tooling | Purchase verification and release operations | Provider-controlled transaction and release records remain | Backend Play verification and release workflows |
| Cloudflare | Account-linked profile fields, request metadata, notification targets, subscription state, and bounded events | App functionality, security, backend processing, and abuse prevention | User-linked D1 records handled by the app are deleted through the account deletion flow; infrastructure retention follows configured policies | Worker routes, D1 tests, production smoke, public deletion route |

## Save and submission protocol

1. Capture a read-only Play Console snapshot and compare every current answer with this document.
2. Stop when page structure, current values, or engineering evidence differs from the approved state.
3. Verify the website, privacy policy, and deletion URL return HTTPS 200.
4. Verify a support message can be delivered to `info@parsfilo.com` before publishing the support identity.
5. Save account deletion and Data Safety answers only after the bounded browser action plan is approved for the exact current page state.
6. Submit changes for review only after a second read-back shows the intended values.
7. Verify the public Play page after approval and preserve evidence without account identities or secrets.
8. Record production release `1102` as currently completed at 100% (`1.0`). Do not change rollout during policy or metadata work. A 10% cap applies only to a future/staged release after a separate stability and conversion approval.
