# Isolated Android Device Smoke Design

## Goal

Provide a repeatable physical-device acceptance test for the shipped authentication lifecycle without modifying, clearing, replacing, or deleting data from `com.parsfilo.astrology`.

## Chosen Approach

Add a standalone `:device-smoke` Android application module with package `com.parsfilo.astrology.devicesmoke`. The module has no launcher activity and exists only as an instrumentation target. Its single live test initializes a named Firebase application from public client configuration passed as instrumentation arguments, creates a new anonymous Firebase user and Firebase installation ID, exercises the production backend lifecycle, deletes that temporary user, and removes the temporary Firebase installation.

The host runner reads the four public Firebase client values from the already-installed, production-signed APK resource table. It never writes those values into the repository, Gradle files, logs, or test reports. It builds and installs only the standalone smoke APK and its test APK, runs the bounded instrumentation test, and uninstalls both smoke packages in a shell trap.

## Alternatives Considered

1. **Ephemeral Android user:** Best isolation for the full application, but `pm create-user --ephemeral` is blocked by the execution security layer. The block must not be bypassed.
2. **Parallel full application ID:** Would test more UI but risks Firebase Android package restrictions and duplicates the full production dependency graph.
3. **Same-package signed test build:** Can preserve owner data but requires a signed preflight artifact and introduces unnecessary risk when a standalone named Firebase application can validate the live lifecycle.

The standalone device-smoke module is the smallest repeatable solution with the lowest impact on the owner profile.

## Live Lifecycle

The instrumentation test performs these operations in order:

1. Validate that `firebaseApiKey`, `firebaseAppId`, `firebaseProjectId`, `firebaseSenderId`, and `backendBaseUrl` instrumentation arguments are present and bounded.
2. Initialize a uniquely named `FirebaseApp` using those values.
3. Sign in anonymously with `FirebaseAuth.getInstance(namedApp)`.
4. Force-refresh a Firebase ID token.
5. Obtain a real Firebase installation ID through `FirebaseInstallations.getInstance(namedApp)`.
6. `POST /api/v1/users/register` with the Firebase bearer token, sign `aries`, language `en`, platform `android`, notification hour `9`, UTC offset `0`, and the real installation ID.
7. Validate a non-empty backend JWT and opaque user ID without printing either value.
8. `GET /api/v1/users/me` with the backend JWT and validate the registered profile.
9. `POST /api/v1/users/refresh-token` with the backend JWT and validate that the returned JWT is non-empty.
10. `GET /api/v1/users/me` with the refreshed JWT.
11. `DELETE /api/v1/users/me` with the refreshed JWT and require `ok=true` and `firebase_account_deleted=true`.
12. Confirm the deleted backend identity no longer authorizes `GET /api/v1/users/me`.
13. Delete the temporary Firebase installation, sign out, and delete the named Firebase application in `finally` blocks.

## Evidence and Redaction

The test reports only stage names, HTTP status codes, booleans, and bounded lengths. It must never log Firebase ID tokens, backend JWTs, Firebase installation IDs, Firebase user IDs, backend user IDs, API keys, application IDs, project IDs, or sender IDs.

The host runner writes full instrumentation output only to a mode-600 temporary file and removes it after producing a bounded summary. A failure summary may include the failed stage, exception class, and HTTP status but not response bodies or credentials.

## Host Runner Safety

The runner requires an explicit ADB serial and refuses `all`, `current`, wildcards, or an empty value. It validates that the serial is in the `device` state and that `com.parsfilo.astrology` is installed. It records the owner package version before and after the smoke run and fails if it changes.

Forbidden operations in the runner:

- `pm clear com.parsfilo.astrology`
- `pm uninstall com.parsfilo.astrology`
- `adb install` of an APK whose package is `com.parsfilo.astrology`
- `run-as com.parsfilo.astrology`
- reads from `/data/user/0/com.parsfilo.astrology`
- account deletion through the production app UI

Cleanup is limited to `com.parsfilo.astrology.devicesmoke` and `com.parsfilo.astrology.devicesmoke.test`.

## Build and CI

The existing project includes `:device-smoke`. Normal CI compiles `:device-smoke:assembleDebug` and `:device-smoke:assembleDebugAndroidTest`; live execution remains an explicit local device operation because CI has no physical phone. The module uses the repository Firebase BOM, Firebase Auth, Firebase Installations, OkHttp, Kotlin serialization, coroutines Play Services integration, AndroidX test runner, and JUnit.

## Acceptance Criteria

- Host contract tests prove exact-serial targeting, public-resource extraction, bounded output, owner package preservation, and smoke-only cleanup.
- The smoke module and test APK compile in CI.
- The physical Redmi test passes all register, refresh, profile, FID, delete, and post-delete authorization assertions.
- The owner package version and signing certificate remain unchanged.
- The owner application opens to the same existing state after smoke cleanup.
- The repository test, lint, formatting, secret-scan, Android build, and backend gates remain green.
