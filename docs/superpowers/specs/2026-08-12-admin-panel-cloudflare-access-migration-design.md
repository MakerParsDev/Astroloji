# Admin Panel Auth Migration: Firebase Auth → Cloudflare Access

**Issue:** follow-up to the Phase 1 admin panel integration (`docs/superpowers/specs/2026-08-12-admin-panel-integration-design.md`) — replaces its Firebase-identity auth bridge with Cloudflare Access before that bridge ever reached real production traffic.

## Goal

Replace Firebase Auth as the identity/authorization mechanism for the entire admin-notifications panel — all seven tabs, not just the Astroloji one — with Cloudflare Access (Zero Trust). Remove Firebase Auth sign-in, Firebase ID token verification, and the Firestore `admins` collection allowlist from all three places that currently implement or consume them: the panel (`side-projects/admin-notifications`), the Cloudflare Worker (`side-projects/cloudflare/workers/admin-api`), and Astroloji's own backend (`backend/src/middleware/auth.ts`, `backend/src/utils/jwt.ts`).

## Current state and confirmed gaps

Today, the panel signs in via Firebase Auth (Google redirect or email/password) against the shared `makerpars-oaslananka-mobil` Firebase project, then gates its own dashboard behind a `POST /adminAccessCheck` call. That call is served by Firebase Cloud Functions (`side-projects/firebase/functions/src/adminAccessCheck.ts` + `adminAuth.ts`), which is currently returning `503` in production — confirmed live (`curl` against `https://europe-west1-makerpars-oaslananka-mobil.cloudfunctions.net/adminAccessCheck` returns `503 The service you requested is not available yet`), and `gcloud functions describe` on the same project returns `403 ... please check billing account associated and retry`. The Cloud Functions path is broken at the infrastructure/billing layer, not the code layer.

A duplicate implementation of the same check (`ensureAdminAccess`, `getFirestoreDoc`, `upsertAdminDoc`, `parseAllowedEmails`) already exists in the Cloudflare Worker `contentapp-admin-api` (`side-projects/cloudflare/workers/admin-api/src/index.ts`), reachable at `https://contentapp-admin-api.oaslananka.workers.dev/adminAccessCheck` and confirmed live and healthy (`401 Missing Bearer token` for an unauthenticated call, not `503`). As an interim fix (already shipped, not part of this spec's remaining work) the panel's `VITE_FUNCTIONS_BASE_URL` was pointed at this Worker instead of Cloud Functions, and the operator's Firestore `admins/<uid>` doc and Firebase `emailVerified` flag were manually corrected to restore access. That interim fix works but leaves the panel dependent on: three separate implementations of the same authorization check (Cloud Functions — dead, Worker, and this session's new `requireAdminPanelAuth` on Astroloji's backend), a Firestore collection as the source of truth for who is an admin, and Firebase Auth's own operational quirks (email-verification flag, ID token caching, Google OAuth session state) as the root cause of today's multi-hour debugging session.

Cloudflare Zero Trust is already active on this Cloudflare account (`oaslananka.cloudflareaccess.com`, created 2024-06-29) with one existing Access Application (`admin.oaslananka.dev`, unrelated portfolio project) using the default Cloudflare identity provider (email one-time-PIN, no Google OAuth configured) and a single-email allow policy — confirmed via the Access API. This is the pattern the new Access Applications below copy exactly.

## Architecture: Access Applications

Three new Cloudflare Access Applications, all under the existing `oaslananka.cloudflareaccess.com` team, all using the existing default Cloudflare (email OTP) identity provider, each with one policy: `decision: allow`, `include: [{ email: { email: "oaslananka@gmail.com" } }]` — copied from the existing `admin.oaslananka.dev` application's policy shape.

| Application | Protects | Notes |
|---|---|---|
| Panel | `admin.parsfilo.com` (whole domain) | Gates page load before any JS runs. Replaces `AuthScreen.tsx` entirely — unauthenticated visitors never reach the React app. |
| Worker admin API | `admin-api.parsfilo.com` (new custom domain, whole domain) | New domain attached to the existing `contentapp-admin-api` Worker, additive only. The existing `contentapp-admin-api.oaslananka.workers.dev` domain is untouched and stays fully public — device traffic (`registerDevice`, `verifyPurchase`, `health`) keeps using it unchanged. Only the panel's browser calls move to the new domain. |
| Astroloji admin panel routes | `astrology.parsfilo.com/api/v1/admin/panel/*` (path-scoped) | The rest of `astrology.parsfilo.com` (end-user app traffic) is untouched and stays public; only this one path prefix sits behind Access. |

Each Application gets a distinct `aud` (audience) tag from Cloudflare on creation — this is the value each backend checks to make sure a token minted for one Application can't be replayed against another.

## Architecture: server-side JWT verification

All three backends adopt the same verification shape. Cloudflare Access injects a `Cf-Access-Jwt-Assertion` header on every request that passed its edge check; nothing else needs to run before that header exists, so there is no separate "login" endpoint to implement — the previous `/adminAccessCheck`, `requireAdminPanelAuth`'s allowlist branch, and their Firestore/Firebase-project lookups are replaced by one shared verification shape per backend:

```ts
async function verifyCloudflareAccessJwt(
  token: string,
  teamDomain: string,   // "oaslananka.cloudflareaccess.com"
  expectedAud: string   // this Application's aud, one per backend
): Promise<{ email: string }>
```

Implementation: fetch `https://${teamDomain}/cdn-cgi/access/certs` (JWKS, cacheable the same way the existing Firebase JWKS fetch is cached in `backend/src/utils/jwt.ts` today — same KV-backed cache pattern, new cache key), verify the JWT's signature, verify `aud` includes `expectedAud`, read `email` from the payload. No further allowlist check is needed in application code — Cloudflare Access already enforced the policy before the request ever reached the origin; a valid, correctly-audienced token is sufficient proof of authorization.

Per-backend wiring:
- **Astroloji backend**: `requireAdminPanelAuth` (`backend/src/middleware/auth.ts`) calls this instead of `verifyAdminPanelIdentity`. `verifyAdminPanelIdentity`, `verifyFirebaseIdTokenForProject`'s admin-panel caller, and `resolveAdminPanelAllowedEmails` are deleted. New config: `ADMIN_PANEL_ACCESS_AUD` (the Astroloji Access Application's aud) — not a secret, since an audience tag alone grants nothing without a valid Access-signed token; it moves to `RuntimeConfigBindings`, deployed the same way `ADMIN_PANEL_FIREBASE_PROJECT_ID` was (GitHub Actions repo variable → `wrangler deploy --var`). `ADMIN_PANEL_FIREBASE_PROJECT_ID` and `ADMIN_PANEL_ALLOWED_EMAILS` are removed from `SecretBindings`/`RuntimeConfigBindings` and from `CLOUDFLARE_SECRET_NAMES`.
- **`contentapp-admin-api` Worker**: `ensureAdminAccess`, `verifyFirebaseIdToken`, `getFirestoreDoc`, `upsertAdminDoc`, `upsertFirestoreDoc`, `parseAllowedEmails` are deleted. Every `admin*`-prefixed route handler (`adminAccessCheck`, `adminGetFlavorHubSummary`, `adminGetAnalyticsSummary`, `adminGetRemoteConfig`, `adminUpdateRemoteConfig`, `adminGetRevenueSummary`, `sendTestNotification`, `deviceCoverageReport`, `adPerformance`) is gated by the new verifier instead. Non-admin routes (`registerDevice`, `verifyPurchase`, `health`) are untouched — they never went through `ensureAdminAccess` in the first place.
- **Firebase Cloud Functions**: `side-projects/firebase/functions/src/adminAccessCheck.ts` and `adminAuth.ts` are deleted outright (dead code, already unreachable from the panel since `VITE_FUNCTIONS_BASE_URL` points at the Worker). Any other exports in that Functions project are left untouched.

## Architecture: panel changes

`side-projects/admin-notifications/src/firebase.ts` loses `auth`, `authPersistenceReady`, `googleProvider`, and the Firebase Auth imports; `firestore` and `functionsBaseUrl` stay if anything else in the panel still legitimately needs them (to be confirmed file-by-file during implementation — nothing in this spec assumes they're needed elsewhere).

`AuthScreen.tsx` is deleted — there is no in-app login UI anymore; an unauthenticated visitor is redirected by Cloudflare Access before the panel's JS ever runs. `App.tsx` loses `onAuthStateChanged`, the `adminState`/`AdminState` "checking/authorized/unauthorized" flow, the `/adminAccessCheck` `useEffect`, and `handleSignOut` (Access has its own logout, reachable at `https://admin.parsfilo.com/cdn-cgi/access/logout`).

Every panel component that currently takes a `user: User` prop and calls `user.getIdToken()` (`FlavorHubPanel`, `AnalyticsPanel`, `RevenuePanel`, `RemoteConfigPanel`, `TestPushPanel`, `EventListPanel`, `EventFormPanel`, `AstrolojiPanel`) drops that prop entirely. `fetchAdminFunctionJson` (`helpers.ts`) drops its `idToken` parameter and adds `credentials: 'include'` to the underlying `fetch` call, so the browser's Cloudflare Access session cookie is sent automatically. `AstrolojiPanel.tsx` (added this session) changes the same way as every other panel component — this is a mechanical, not a special-cased, migration.

## Cross-domain session risk

`admin.parsfilo.com` (panel), `admin-api.parsfilo.com` (Worker), and `astrology.parsfilo.com` (Astroloji) are three different origins, each independently protected by Access. Passing Access's check on one does not, by itself, attach its cookie to requests toward the other two. Cloudflare's team-wide SSO means the *first* cross-origin call after login triggers a silent redirect handshake (no re-entry of the OTP code) that sets that second domain's Access cookie — this is Cloudflare's documented, supported pattern for exactly this SPA-plus-separate-APIs shape, and the existing `admin.oaslananka.dev` Application proves Access itself is already configured correctly on this account.

The one implementation requirement this imposes: `Access-Control-Allow-Origin` on both `admin-api.parsfilo.com` and `astrology.parsfilo.com/api/v1/admin/panel/*` must be the literal string `https://admin.parsfilo.com`, never `*` — a wildcard origin is incompatible with `credentials: 'include'` per the Fetch spec, and the browser will refuse to attach or read the Access cookie on a wildcarded response.

## Verification

Per-backend automated tests mirror the existing pattern already used for `requireAdminPanelAuth`'s Firebase-based checks in this session (`backend/tests/middleware/adminPanelAuth.test.ts`): the new `verifyCloudflareAccessJwt`-equivalent is mocked at the module boundary, and the middleware/route tests assert:

- a request with no `Cf-Access-Jwt-Assertion` header → 401;
- a token that fails signature/JWKS verification → 401;
- a token whose `aud` doesn't match this backend's expected Application → 401 (proves an Astroloji-audienced token can't be replayed against the Worker or vice versa);
- a token that verifies cleanly → 200, and the audit log (where one exists, e.g. Astroloji's `logAdminOperation`) never contains the caller's email, matching the existing sanitized-log rule.

There is no automated end-to-end test for the real Cloudflare Access login flow or the cross-domain SSO handshake — minting a real Access-signed JWT outside of an actual browser OTP login isn't practical to script, matching how this session's `requireAdminPanelAuth` work was already verified live post-deploy rather than in CI. End-to-end verification is manual: sign in once at `admin.parsfilo.com`, confirm every tab (not just Astroloji) loads its data, confirm a signed-out browser is redirected to the Access login page for all three domains individually.

## Out of scope

- Adding Google OAuth (or any identity provider beyond Cloudflare's default email-OTP) to the Zero Trust team — explicitly declined during design; can be added later without touching any of the Application/backend wiring above.
- A proxy layer that would make all three domains same-origin from the browser's perspective — considered and explicitly declined in favor of the simpler three-Application design.
- Any change to non-admin routes on any of the three backends (`registerDevice`, `verifyPurchase`, `health` on the Worker; end-user routes on Astroloji's backend).
- Local/offline development workflow for testing Access-gated routes without a live Cloudflare login — not addressed; this tooling is operated by a single admin and has, to date, always been verified against the live deployment.
- Any other exports in `side-projects/firebase/functions` beyond `adminAccessCheck.ts`/`adminAuth.ts`.

## Definition of done

All three backends verify Cloudflare Access JWTs instead of Firebase ID tokens, scoped to their own Access Application's `aud`. The panel has no Firebase Auth code path left — no sign-in screen, no `getIdToken()` calls anywhere in `src/`. `side-projects/firebase/functions/src/adminAccessCheck.ts` and `adminAuth.ts` are deleted. `ADMIN_PANEL_FIREBASE_PROJECT_ID` and `ADMIN_PANEL_ALLOWED_EMAILS` no longer exist anywhere in Astroloji's `backend/` (types, secrets, deploy scripts, tests). A signed-out browser hitting any of the three protected domains is redirected to Cloudflare's login page; a signed-in browser (`oaslananka@gmail.com`) can load every panel tab, including Astroloji's.
