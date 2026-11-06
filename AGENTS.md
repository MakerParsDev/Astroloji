# Agent guide — Astroloji

This file is a short routing guide for code changes. Canonical setup, architecture,
security, and release instructions live in the repository's existing documentation.

## Sources of truth

- [README.md](README.md): architecture, developer setup, local commands, CI, secrets
  handling, and supported Android/Cloudflare deployment paths.
- [backend/README.md](backend/README.md) and [backend/package.json](backend/package.json):
  Cloudflare Worker API, D1, signed callbacks, and test commands.
- [Astroloji/app/build.gradle.kts](Astroloji/app/build.gradle.kts) and
  [Astroloji/gradle/libs.versions.toml](Astroloji/gradle/libs.versions.toml):
  Android variants, dependencies, and release build configuration.
- [Astroloji/play/README.md](Astroloji/play/README.md): store metadata, locales,
  backup/diff checks, and publishing safeguards.
- [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md) and [.github/workflows](.github/workflows):
  guarded Play releases, Worker deploys, CI, and rollback procedures.

## Verification before a PR

- Backend: from `backend/`, run `npm ci`, `npm test`, `npm run test:runtime`,
  and `npm run build` as applicable. Runtime tests use local Worker bindings;
  they are not production acceptance.
- Android: from `Astroloji/`, use the Gradle wrapper. Start with focused
  `:app:testDebugUnitTest`, `:app:ktlintCheck`, and `:app:detekt` checks;
  use relevant lint/build and CI checks for broader changes.
- **Sparse checkouts:** `backend/tests/contracts/analyticsEvents.test.ts` reads
  `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/AnalyticsRepository.kt`.
  Include this tracked file in a sparse worktree before running backend tests.
  An absent file is not an analytics contract failure.
- Respect required CI, security scans, reviews, and protected `main`. A locally
  green test suite is not evidence of a signed Android release or live delivery.

## Security and production boundaries

- Never commit service-account files, local `.dev.vars`, signing material,
  credentials, personal event data, purchase tokens, or identifying analytics.
- Firebase Analytics, backend D1, and AdMob observe different event paths.
  Compare only aligned dates, versions, consent/identity cohorts, and event
  definitions; test-ad analytics is not proof of paid impressions.
- Preserve account ownership, billing acknowledgement, consent gates, rewarded
  SSV signature checks, and privacy/deletion safeguards.
- Follow guarded workflows and the runbook for releases, store metadata, and
  Worker deployment. Recheck live provider gates first; do not use production
  user data or an unsanctioned local debug build as test substitutes.
