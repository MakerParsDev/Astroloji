# Google Play global discovery — pre-publication readiness (2 Nov 2026)

Scope: MakerParsDev/Astroloji, package com.parsfilo.astrology. This document is
a non-publishing review of the existing six-language listing and the signed
1109 release. Do not interpret it as authorization to modify Google Play.

## Verified baseline and release compatibility

- Play Console showed Production 1109 submission #27 **in review**, with 178
  countries/regions, while the previously available production code was 1105.
  The listing exposed tr-TR and en-US; de-DE, es-ES, fr-FR and pt-BR existed
  in source but not yet in the live listing.
- The signed 1109 AAB originated from main at
  69de5c10748de89b460b63c7698c11f61ac57ddf.
- The 36 localized phone screenshots were **replaced** by PR #233, merged as
  1ccf7197683ff53b2e46bb50d160206a7c9b8c7d. That PR also changed
  production Home, Weekly, Monthly, Onboarding, Premium, Compatibility and
  Premium Navigation UI code. PR #233 is **not** an ancestor of the signed
  1109 source. The replacement screenshot set thus reflects a later UI.
- Consequently, the new 36-image set is **not approved as a faithful 1109
  screenshot set**. Do not publish it just because submission #27 is approved.
  First obtain a separately authorized, Play-distributed production build
  containing the relevant UI, and compare real behavior against the images.
  Do not create a test track or a replacement AAB merely to unblock metadata.
- Six-language metadata validation currently passes, but validates format and
  assets, **not** signed-binary screenshot parity.
- No Play Store write, release/deploy, purchases, user-device update or
  settings mutation was performed for this audit.

## Localization review — candidate copy (NOT active source)

Existing canonical listing files are already policy-conscious: clear daily
horoscope and compatibility intentions, six genuine translations, and
non-medical notices. Keep the published tr-TR/en-US copy and current metadata
publication contract unchanged during review. These are **optional,
unpublished candidates** for a future separate copy decision, not invented
search-volume or ranking evidence. Titles are retained to protect recognition.
Only the short description and opening sentence are candidates; preserve
existing subscriptions, privacy, deletion and mood-health disclosures.

| Locale | Retain title | Candidate short description |
| --- | --- | --- |
| tr-TR | Astroloji: Günlük Burç | Günlük burç yorumları, aşk uyumu ve haftalık astroloji rehberi. |
| en-US | Astrology: Daily Horoscope | Daily horoscope, zodiac compatibility, and weekly astrology guidance. |
| de-DE | Astrologie: Tageshoroskop | Tageshoroskop, Sternzeichen-Kompatibilität und Wochenüberblick. |
| es-ES | Astrología: Horóscopo Diario | Horóscopo diario, compatibilidad zodiacal y guía astrológica semanal. |
| fr-FR | Astrologie : Horoscope du Jour | Horoscope du jour, compatibilité des signes et guide hebdomadaire. |
| pt-BR | Astrologia: Horóscopo Diário | Horóscopo diário, compatibilidade entre signos e guia semanal. |

Proposed opening paragraph for each language, to make the primary search intent
and actual in-app features understandable before generic marketing text:

- tr-TR: Günlük burç yorumunuzu okuyun; haftalık ve aylık astroloji rehberlerini
  keşfedin, burç uyumunu ve kişilik özelliklerini inceleyin.
- en-US: Read your daily horoscope, explore weekly and monthly astrology
  guidance, compare zodiac compatibility, and discover your sign's traits.
- de-DE: Lesen Sie Ihr Tageshoroskop, entdecken Sie Wochen- und Monatsübersichten
  und vergleichen Sie Sternzeichen in Liebe, Freundschaft und Beruf.
- es-ES: Consulta tu horóscopo diario, explora las guías semanales y mensuales
  y compara la compatibilidad de los signos del zodiaco.
- fr-FR: Consultez votre horoscope du jour, explorez les guides de la semaine
  et du mois et comparez la compatibilité entre signes du zodiaque.
- pt-BR: Confira seu horóscopo diário, explore os guias semanais e mensais
  e compare a compatibilidade entre os signos do zodíaco.

No claim of keyword rank or volume has been verified. Search behavior and
country-level organic conversion should determine whether to adopt these
alternatives; avoid keyword blocks, unsupported benefits, ranking claims,
pricing promises and generic AI-sounding marketing prose.

## Store settings and discovery

- The live app type is **App**, category **Lifestyle (Yaşam Tarzı)**.
  Keep that category; it is accurate for a nonmedical astrology product.
- The tag picker displayed no currently selected tag. **Horoscope
  (Yıldız Falı)** is directly relevant and available in Play's tag catalog;
  queue it as the **single primary tag** for the first permitted settings
  change. Do not fill five slots with weakly related tags. Re-read the
  actual selection before applying; category/tag changes may require review.
- External marketing is enabled; leave it enabled.
- No custom store listings were present and no store listing experiment had
  been run. Start with six default-listing translations instead of creating
  speculative duplicate country listings or A/B tests with this traffic.
  Reassess custom listings after country/query reports show a distinct need.
- In Store settings, the displayed Website is
  https://parsfilo.com/privacy/ (HTTP 200). The proposed app landing page
  https://astrology.parsfilo.com/ returned **HTTP 404** on 2 Nov; the
  application-specific /privacy and /delete-account endpoints returned 200.
  **Do not switch the Website to a broken homepage.** A genuine public app
  landing page must be available and verified before any later change.
  The live privacy-policy and deletion URLs are separate fields and must
  remain accurate.

## Acquisition baseline and measurement

The Play Console overview reported, for its displayed 28-day window,
approximately 2,090 device impressions, 24 acquisitions, 3 first opens and
8 monthly active devices. The listing report showed 30 visitors and 15
unique install clicks for its own period/denominator, **not** 15 confirmed
installs. Attribution and period definitions differ. These tiny counts
do not justify an uplift prediction, significance claim or immediate A/B
test. After publication, compare Play organic search/browse and country /
locale cohorts with exact windows, then app-version-specific first opens,
onboarding, retention, crash/ANR and purchase/ads evidence where present.
Missing metrics are unknown, not zero.

## Next authorized execution boundary

1. Finish Google's existing #27 review without modifying Play metadata,
   settings, tags, country targets, rollout, release or production code.
2. Independently confirm the actual Production version and review outcome.
3. For any later metadata operation, obtain a **new** live backup and diff,
   prove unchanged existing text/track/subscriptions, and use the existing
   verified, narrow, guarded publication workflow. Historical backups expire.
4. For the 36 replacement screenshots specifically, wait for a public
   signed binary whose source includes PR #233 and verify UI parity first;
   do **not** auto-publish them against 1109.
5. Apply category tag and website adjustments only in a separately
   verified, permitted Play-settings change after #27 review; do not
   replace the website URL until its target actually works.
6. Observe organic data before additional store experiments, custom country
   listings, ad spending or new analytics infrastructure.

Sources checked 2 Nov 2026:
- https://support.google.com/googleplay/android-developer/answer/13393723
- https://support.google.com/googleplay/android-developer/answer/4448378
- https://support.google.com/googleplay/android-developer/answer/9859673
- https://support.google.com/googleplay/android-developer/answer/9867158
- https://support.google.com/googleplay/android-developer/answer/9859654
