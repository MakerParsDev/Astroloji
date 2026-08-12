# Admin Panel Integration — Phase 1 (Identity Auth Bridge + Observability + LLM Test Console)

**Issue:** #15 — Define observability, data-retention, and lifecycle guarantees

## Goal

Connect Astroloji's backend to the existing admin-notifications panel (in the separate `MakerParsDev/android-multi-app-framework` repo, `side-projects/admin-notifications/`) so the app owner can observe and manage Astroloji from the same panel already used for the sibling app family, without embedding a static admin secret in that public-repo client-side SPA.

Phase 1 scope, as agreed: an identity-based auth bridge, a health/observability endpoint, and a bounded LLM test-request endpoint that surfaces the provider fallback log. Model/provider selection, data entry, and broader management are explicitly deferred (see Out of scope) and will get their own spec once Phase 1 is live and used.

## Current state and confirmed gaps

Astroloji's admin routes (`registerContentAdminRoutes`, `registerNotificationRoutes`, `registerSubscriptionAdminRoutes`, mounted at `backend/src/index.ts:202-203`) are gated by `requireAdminCapability` (`backend/src/middleware/auth.ts:96`), which checks a request header against one of four static per-capability secrets (`ADMIN_CONTENT_SECRET`, `ADMIN_NOTIFICATION_SECRET`, `ADMIN_PLAY_READ_SECRET`, `ADMIN_PLAY_WRITE_SECRET` — `backend/src/types.ts:148-151`). This scheme assumes the caller already holds a shared secret out of band. That's fine for CI/CLI callers; it is not safe for a client-side SPA bundle, where anything shipped to the browser is public.

The admin-notifications panel already solves this exact problem for its own backend (`side-projects/cloudflare/workers/admin-api/`): the operator signs in via Firebase Auth (email/password or Google redirect) against a shared Firebase project, and that worker verifies the resulting ID token server-side, checking the token's email against an `ADMIN_ALLOWED_EMAILS` allowlist. No static secret ever reaches the browser.

Astroloji's backend already has an equivalent building block: `verifyFirebaseIdToken` (`backend/src/utils/jwt.ts:112`) validates a Firebase ID token's signature against Google's public JWKS (`resolveFirebaseVerificationKey`, `backend/src/utils/jwt.ts:67-108`, cached in KV for an hour) and checks `iss`/`aud` against a project ID resolved from `env.FIREBASE_SERVICE_ACCOUNT_JSON`. It is already used in production at `backend/src/workers/user.ts:204` during end-user registration/sign-in.

Two gaps block reusing it as-is for the admin panel:

1. It is pinned to Astroloji's own Firebase project (parsed from Astroloji's own service-account JSON). The admin-notifications panel signs into a *different* Firebase project — the multi-app framework's shared project (confirmed via that repo's `.env.template`, which references `contentapp-admin-api.oaslananka.workers.dev` and ships its own `VITE_FIREBASE_*` config). A token from that project fails Astroloji's `iss`/`aud` check as written today.
2. `FirebaseIdTokenClaims` (`backend/src/types.ts:217-225`) only carries `aud`, `iss`, `sub`, `user_id`, `firebase.sign_in_provider` — no `email`. The allowlist check this design needs has no claim to read today.

Astroloji's LLM gateway (`backend/src/llm/`) already runs a multi-provider fallback chain per generation call (`routeLlmGenerate`, `backend/src/llm/router.ts:25-43`), and every call site (`dailyContentGenerator.ts`, `deepReadingGenerator.ts`, `chatConsultationGenerator.ts`) already collects a structured `attempts: { providerId, error }[]` log of every provider tried and why it failed. That log is discarded after the request — it is never persisted or exposed anywhere. Today, "is the LLM pipeline actually working, and which provider is serving traffic" is not answerable without reading raw Worker logs.

Only one provider is actually wired into any chain today: Workers AI on `@cf/meta/llama-3.1-8b-instruct` (`backend/src/llm/dailyContentProviderChain.ts`, `readingProviderChain.ts`). The Anthropic and OpenAI-compatible adapters (`backend/src/llm/adapters/`) exist and are unit-tested but have no Doppler keys and are not wired into any chain — provider/model selection is a code change today, not a runtime setting. Phase 1 only surfaces this state for observability; it does not add configurability.

Adding a Cloudflare secret follows an established path, used by every existing admin capability: add to Doppler → `CLOUDFLARE_SECRET_NAMES` (`backend/scripts/shared.ts:7`) → `SecretBindings`/`RuntimeConfigBindings` (`backend/src/types.ts:144-160`) → `npm run doppler:cf-secrets`.

## Architecture: identity verification for a foreign Firebase project

Extract the JWKS-resolution/signature-verification core already in `resolveFirebaseVerificationKey` (`jwt.ts:67`) into a project-parameterized function. Google's certificate endpoint is shared across every Firebase project — only the `iss`/`aud` check is project-specific, so this is a clean extraction, not a rewrite:

```ts
async function verifyFirebaseIdTokenForProject(
  env: Env,
  token: string,
  projectId: string
): Promise<{ sub: string; email?: string; emailVerified: boolean }>
```

`verifyFirebaseIdToken` (existing, Astroloji's own project) becomes a thin wrapper calling this with `account.project_id` — behaviorally unchanged, still returns the existing `FirebaseIdTokenClaims` shape, still used by `user.ts` unmodified.

A new `verifyAdminPanelIdentity(env, token)` calls the same core with a new config value, `ADMIN_PANEL_FIREBASE_PROJECT_ID` — the framework's Firebase project ID. This is not treated as a secret: it is already public in the panel's own bundled JS via `VITE_FIREBASE_PROJECT_ID`, so it lands in `RuntimeConfigBindings` (alongside `PLAY_RTDN_AUDIENCE`), not `SecretBindings`. `verifyAdminPanelIdentity` additionally reads `email`/`email_verified` off the verified payload, which `verifyFirebaseIdToken` deliberately does not expose today.

## Architecture: admin-panel auth middleware

New `requireAdminPanelAuth` middleware (`backend/src/middleware/auth.ts`, alongside `requireAdminCapability`), mirroring its audit-logging shape:

1. Extract the bearer token from the `Authorization` header; missing/malformed → `401`.
2. Call `verifyAdminPanelIdentity`; any verification failure (bad signature, wrong project, expired, malformed) → `401`.
3. Require `email_verified === true` and `email` present in a new secret `ADMIN_PANEL_ALLOWED_EMAILS` (comma-separated, `SecretBindings`, same Doppler pattern as the other four admin secrets) → otherwise `403`.
4. Log via the existing `logAdminOperation` helper (`backend/src/services/adminAudit.ts:17`) with a new capability `'admin-panel'` and operations scoped to this route group (`ADMIN_CAPABILITIES`/`ADMIN_OPERATIONS`, `backend/src/types.ts:118-127`, get one new capability entry and one new operation entry per Phase 1 route — additive, no existing entries change). The caller's email and token are never logged, matching the existing "allowlisted capability/operation/outcome fields only" rule from the 2026-08-08 least-privilege design.

New routes mount under `/api/v1/admin/panel/*` — a new `apiAdminPanelRoutes` Hono sub-app in `backend/src/index.ts`, alongside the existing `apiAdminRoutes`, gated by `requireAdminPanelAuth` instead of `requireAdminCapability`. Keeping this on its own prefix, rather than folding it into the four existing capabilities, keeps the static-secret admin surface (CI/CLI-facing) and the identity-based admin surface (browser-facing) on separate, independently revocable trust boundaries: pulling the panel's Firebase project ID or clearing the allowlist cannot touch CI's admin secrets, and vice versa.

## Architecture: Phase 1 endpoints

`GET /api/v1/admin/panel/health` extends the existing public `/api/v1/health` (`index.ts:104`, currently D1 + R2 reachability only) with:

- KV (`CACHE`) reachability — read/write a canary key.
- LLM provider-chain composition per task type — which adapters are actually wired into `buildDailyContentProviderChain` / `buildReadingProviderChain` today, read structurally (provider id + configured model string), not by making a live provider call. Answers "what's live right now" cheaply, at zero token cost.

This is a superset of the public `/health`, not a replacement — the public endpoint stays unauthenticated for uptime monitors and is untouched.

`POST /api/v1/admin/panel/llm/test` is the "send a test request and read the result/log" capability. Request body: `{ taskType: 'daily_content' | 'deep_reading' | 'chat_consultation' }` (reuses `LlmTaskType` from `provider.ts`). The prompt is fixed and server-defined per task type — the caller does not supply arbitrary prompt text, so token cost stays bounded and predictable regardless of who has panel access. The handler resolves the same provider chain the real route would use for that task type and calls `routeLlmGenerate` directly (not `routeLlmGenerateForUser` — no budget is recorded against any real user), returning:

```text
{
  succeeded: boolean,
  providerId: string | null,
  text: string | null,
  usage: { inputTokens: number; outputTokens: number } | null,
  attempts: [{ providerId: string, error: string }]
}
```

This is exactly the `attempts` array every generator already computes and discards (e.g. `dailyContentGenerator.ts:151`). Phase 1 adds no new fallback or logging logic — it gives an existing internal value an HTTP door. There is no response caching (the content cache key scheme is per-user/per-day; this is an operator smoke test, not user-facing content) and a fully-down provider chain returns `200` with `succeeded: false`, not a server error — that outcome is informative, not exceptional.

## Architecture: panel-side changes (other repo)

In `side-projects/admin-notifications/`:

- New `src/astrolojiApi.ts` reads a new `VITE_ASTROLOJI_API_BASE_URL` env var (`https://astrology.parsfilo.com`), gets the current Firebase ID token from the panel's *existing* signed-in session (`auth.currentUser.getIdToken()` — no new sign-in flow, no new Firebase project config in the panel), and calls the two Phase 1 endpoints with `Authorization: Bearer <token>`.
- New `src/AstrolojiPanel.tsx` tab is added to the existing tab set alongside `FlavorHubPanel` / `SystemHealthPanel` / etc., rendering the health payload and a "run test" action per task type that shows `attempts` inline.
- That repo is outside this session's write access. Implementing this half is a separate PR against `MakerParsDev/android-multi-app-framework`, written after this spec and Astroloji's backend half are both approved and merged, using the same Firebase project ID and route contract this spec fixes.

## Admin-panel-auth verification

Required automated test cases (`backend/tests/`):

- Valid token from `ADMIN_PANEL_FIREBASE_PROJECT_ID`, `email_verified: true`, matching allowlist entry → `200` on `/admin/panel/health`.
- Valid token from Astroloji's *own* Firebase project (one that would pass `verifyFirebaseIdToken`) → `401` on `/admin/panel/*`, confirming the two trust boundaries don't cross.
- Valid token, correct project, email not in `ADMIN_PANEL_ALLOWED_EMAILS` → `403`.
- Valid token, correct project, `email_verified: false` → `403`.
- Expired token → `401`.
- Malformed or missing `Authorization` header → `401`.
- `/admin/panel/llm/test` with every provider in the chain failing → `succeeded: false`, `attempts` has one entry per configured provider, response status is still `200`.
- `/admin/panel/llm/test` never calls `recordLlmUsage` — assert no budget KV write occurs.
- Audit log entries for this route group never contain the caller's email or raw token, matching the existing sanitized `admin_operation` event contract.

## Out of scope (Phase 1)

- LLM provider/model selection UI or runtime-configurable provider chains — today's chains are hardcoded in TS; making them KV/D1-configurable is a separate, larger design for a later phase.
- Data-entry or content-management surfaces beyond what `registerContentAdminRoutes` already exposes.
- Any change to the four existing static-secret admin capabilities, their routes, or their credentials.
- Any change to Astroloji's own end-user Firebase project, sign-in flow, or `verifyFirebaseIdToken`'s existing behavior/callers.
- Building or deploying the panel-side React changes described above — this spec fixes the contract; the panel PR is separate work in the other repo.
- Rate-limiting the new panel routes beyond the identity allowlist gate — revisit if panel access ever extends beyond one operator.

## Definition of done (Phase 1)

The `requireAdminPanelAuth` middleware, `verifyAdminPanelIdentity`, the two new routes, and every case in the verification list above are merged from CI-green `main`. `ADMIN_PANEL_FIREBASE_PROJECT_ID` and `ADMIN_PANEL_ALLOWED_EMAILS` exist in Doppler and are synced to Cloudflare via the standard `doppler:cf-secrets` path. The panel-side PR against `android-multi-app-framework` is a follow-up, not part of "done" here — it depends on this contract being live first.
