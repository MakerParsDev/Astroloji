# Astroloji Data Safety and Privacy Operations Matrix

- **Effective implementation date:** 2026-08-05
- **Package:** `com.parsfilo.astrology`
- **Owner:** MakerParsDev / ParsFilo
- **Purpose:** Source-of-truth checklist for Google Play Data safety, the public privacy policy, SDK review, and release approval.

This document is an engineering and release-operations record, not legal advice. Before each production submission, the release owner must compare this matrix with the exact artifact, Firebase/AdMob/Cloudflare configuration, Play Console answers, regional consent configuration, and current provider disclosures.

## Decision rules

1. “Collected” follows Google Play’s off-device transmission definition, not only permanent database storage.
2. Data used only in memory for the real-time request may qualify as **ephemeral processing**, but the Play Console form must still be answered accurately.
3. Service-provider processing is documented even when it may not count as “sharing” under a Play exception.
4. No raw birth date, free-form journal, personal note, compatibility score history, or share-recipient identity is allowed in analytics metadata.
5. New SDKs and new event metadata fail release review until this matrix, the public policy, and Play Console answers are updated together.

## Active data flows

| Data type / surface | Source and optionality | Off-device transmission | Purpose | Persistence and deletion | Provider / recipient | Play Console operator action |
|---|---|---|---|---|---|---|
| Firebase/app user ID and session token | Automatically created to operate the app | Yes | Authentication, authorization, abuse prevention | Account-linked server records are deleted through in-app account deletion; short-lived tokens expire | Firebase Authentication, Cloudflare backend | Declare identifiers/account data as applicable; security and app functionality |
| Selected zodiac sign, language, UTC offset, notification preference/hour | User-selected or derived; core profile | Yes | Content selection, notification scheduling, localization | Stored in account profile and on device until changed or account/app data deletion | Cloudflare, Firebase/FCM for notifications | Declare personalisation/app functionality where required |
| **Date of birth** for Personal Guidance Beta | Optional, user-selected immediately before calculation | **Yes — transmitted for personal guidance** | Real-time natal/transit calculation | **Ephemeral**: used in Worker memory for the request; not written to D1, R2, analytics, logs, or Android preferences by this feature | Cloudflare as service provider | Review under Personal info / Date of birth; mark optional and ephemeral if the current form permits; keep prominent in-app disclosure |
| Personal guidance calculation output | Generated from date and current target time | Yes, returned to requesting device | Provide three traceable reflection signals | Kept only in Android ViewModel memory in the current beta; cleared when the date changes, user clears it, or screen process ends | Cloudflare backend | App functionality; do not describe as stored profile data |
| Firebase installation ID and platform; legacy FCM registration token during rollout | Automatically generated; optional notifications | Yes | Deliver requested notifications and manage target lifecycle | Stored until target rotation, notification removal, account deletion, or provider retention rules | Firebase Cloud Messaging, Firebase Installations, Cloudflare | Declare device or other IDs as applicable; app functionality |
| Firebase Analytics app interactions | Automatic/feature events subject to consent and configuration | Yes | Product measurement, reliability, funnel analysis | Firebase retention configuration plus bounded local offline queue; account deletion removes app-linked backend events where supported | Firebase Analytics, Cloudflare event endpoint | Declare App activity / App interactions; analytics purpose; verify Firebase SDK Data safety guidance |
| Structured daily feedback category | Optional: `resonated`, `partly`, or `not_today` only | Yes for analytics; last date/category also remains on device | Content quality measurement and duplicate-prompt prevention | Last date/category stays in DataStore until replaced or local app data deletion; analytics follows event retention. No free text | Firebase Analytics, Cloudflare | Declare App activity / Other user-generated content only if Console taxonomy requires; otherwise App interactions. Never claim a journal is collected |
| Share click event | User taps share; no recipient result available | Yes | Measure share intent, not completion | Event retention only; `share_completed` is not emitted | Firebase Analytics, Cloudflare | App interactions / analytics |
| Anonymous share link | User-initiated transfer of a zodiac sign or canonical sign pair | Yes to recipient/browser when user shares | Organic discovery and app opening | Landing URL contains no account ID, score history, user ID, UTM, or recipient identity; standard edge request logs may follow Cloudflare settings | Recipient-selected app, Cloudflare landing page, Google Play | Treat as user-initiated transfer; review Cloudflare network metadata and public policy. Do not claim recipient tracking |
| Crashlytics crash and diagnostics data | Automatic after SDK/consent configuration | Yes | Crash diagnosis and stability | According to Firebase Crashlytics retention and deletion capabilities | Firebase Crashlytics | Declare App info and performance / Crash logs and Diagnostics; analytics purpose |
| Remote Config fetch and installation identifiers | Automatic SDK operation | Yes | Safe feature flags, ad limits, release controls | Provider-managed according to Firebase configuration | Firebase Remote Config | Review Firebase SDK Data safety guidance and identifiers |
| Google Play purchase token, product ID, subscription state, expiry | User purchase/restore action | Yes | Billing verification, entitlement, fraud prevention, support | Account-linked subscription records until deletion/legal retention; Google Play keeps its own transaction records | Google Play Billing, Google Play Developer API, Cloudflare | Declare Purchase history; app functionality, fraud prevention, account management |
| Google Mobile Ads data, advertising ID or equivalent signals, consent status | Ad-supported users, subject to consent/region/configuration | Yes | Ad delivery, frequency, measurement, fraud prevention | Provider-controlled plus local consent/frequency values; premium users do not preload ads | Google Mobile Ads, User Messaging Platform | Complete all advertising/device ID/data types from current Google SDK guidance; advertising purpose; sharing status depends on configuration |
| Consent status and ad frequency counters | On-device operational values | No, except SDK consent interaction/provider processing | Respect consent and prevent excessive ads | DataStore until changed or local app data deletion | Device; UMP where applicable | On-device-only values are not collection by themselves; disclose related SDK flows separately |
| Favorites, onboarding state, last feedback category | User/device preferences | Primarily on-device; selected profile fields may sync as listed above | UX continuity | DataStore until user clears data/account; favorites storage behavior must remain documented if server sync is added | Device today | No off-device collection for purely local values; rerun review if sync is introduced |
| Network metadata such as IP address | Inherent in HTTPS requests | Yes | Transport, security, abuse prevention | Controlled by Cloudflare logs/security configuration; release owner must verify current retention | Cloudflare | Review whether Device or other IDs / approximate location declarations are triggered by actual provider configuration; do not infer location in app code |

## Data explicitly prohibited from analytics

The Android analytics allowlist must continue to reject raw or free-form values such as:

- Date of birth or natal timestamp
- Email address, name, phone number, or precise location
- Free-form journal, personal note, relationship text, health statement, or financial statement
- Purchase token, JWT, Firebase installation ID, legacy FCM registration token, advertising ID, or service error body
- Share recipient, contact list, or recipient identity

Allowed event metadata remains categorical and bounded: source, step, result, plan, product, placement, sign/sign pair, locale, reason, and ad format.

## Account deletion and local deletion

- In-app **Delete account and data** removes the server account/profile, notification token association, user-linked events/rewards/subscription records handled by the app, Firebase identity, and local app data as implemented.
- Google Play subscription cancellation remains a separate user action in Google Play.
- Personal Guidance birth date is not retained by the chart feature, so there is no chart birth-date database record to delete.
- Clearing local app data or uninstalling removes the last daily feedback category and other DataStore values.
- Anonymous or aggregated provider records may remain only where they can no longer be associated with the deleted account or where legal/provider retention applies.

## Release gate

Before publishing any release, attach evidence for all of the following:

- [ ] Privacy page and in-app disclosures match the shipped artifact.
- [ ] Play Console Data safety draft was compared row-by-row with this matrix.
- [ ] Firebase Analytics, Crashlytics, FCM, Remote Config, Google Mobile Ads/UMP, Google Play Billing, and Cloudflare provider guidance/configuration were reviewed.
- [ ] Birth date remains optional, transient, stateless, absent from analytics/logging, and protected by TLS.
- [ ] `scripts/scan-secrets.mjs`, `scripts/data-safety-contract.test.mjs`, Android tests, backend tests, and runtime smoke tests pass.
- [ ] Account deletion works in app and the public deletion page is reachable.
- [ ] No SDK, permission, event key, backend log, or storage schema was added without updating this matrix.
