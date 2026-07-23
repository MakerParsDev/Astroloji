# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-03-26

### Added
- Android Astroloji application with Jetpack Compose, Hilt, Room, DataStore, Firebase, WorkManager, Glance widget, AdMob, and Play Billing integration.
- Cloudflare Worker backend with Hono, D1, R2, KV, Firebase auth integration, notification delivery, and Google Play subscription verification flows.
- CI workflows for secret scanning, backend validation, Android validation, and scheduled content backfill.
- Repository-level secret scanning and example configuration files for Android and backend environments.

### Changed
- Hardened backend request validation and Google Play RTDN parsing for type-safe builds and safer error handling.
- Improved Android content refresh behavior so manual refresh paths bypass stale cache when needed.
- Stabilized GitHub Actions by upgrading action runtimes and adding CI-specific Gradle memory settings for Android builds.
- Added lightweight backfill support for future content generation without re-uploading static assets.

### Security
- Removed tracked secret-bearing artifacts and replaced them with example templates and documented secret-management flows.
- Patched the transitive `picomatch` vulnerability to `4.0.4`, clearing the repository's Dependabot alert state.

