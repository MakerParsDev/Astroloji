# Admin Panel Integration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing admin-notifications panel (a separate repo) call two new, identity-gated endpoints on Astroloji's backend — a health/observability check and a bounded LLM provider test — without ever shipping a static admin secret to that public-repo browser bundle.

**Architecture:** Extract the JWKS/signature-verification core already used for Astroloji's own end-user Firebase sign-in into a project-parameterized function, add a second verification path pinned to the admin panel's own (different) Firebase project plus an email allowlist, gate two new routes behind it, and wire the two new configuration values through the repo's existing Doppler-secret / GitHub-Actions-var deployment pipelines.

**Tech Stack:** Cloudflare Workers, Hono, TypeScript, `jose` (JWT/JWKS), Zod, Vitest, Doppler, `wrangler`, GitHub Actions.

## Global Constraints

- `verifyFirebaseIdToken`'s existing external behavior, return shape, and caller (`backend/src/workers/user.ts:204`) must not change. (Spec: "Architecture: identity verification for a foreign Firebase project")
- None of the four existing admin capabilities (`content-ops`, `notification-ops`, `play-read`, `play-write`), their routes, or their static secrets change. (Spec: "Out of scope")
- `ADMIN_PANEL_FIREBASE_PROJECT_ID` is not a secret — it belongs in `RuntimeConfigBindings` and is deployed the same way as `PLAY_RTDN_AUDIENCE` (a `wrangler deploy --var`, sourced from a GitHub Actions repo variable), not `wrangler secret put`. (Spec: "Architecture: identity verification for a foreign Firebase project")
- `ADMIN_PANEL_ALLOWED_EMAILS` is a secret — it belongs in `SecretBindings`, synced via the existing Doppler → `CLOUDFLARE_SECRET_NAMES` → `npm run doppler:cf-secrets` path. (Spec: "Architecture: admin-panel auth middleware")
- `/api/v1/admin/panel/llm/test` must call `routeLlmGenerate`, never `routeLlmGenerateForUser` — no token usage may be recorded against any real user's daily budget. (Spec: "Architecture: Phase 1 endpoints")
- The test endpoint's prompt is fixed and server-defined per task type; the caller never supplies free-text prompt content. (Spec: "Architecture: Phase 1 endpoints")
- Panel-side changes (the other repo, `MakerParsDev/android-multi-app-framework`) are out of scope for this plan. (Spec: "Definition of done (Phase 1)")

---

### Task 1: Extend shared types and test defaults for the new admin-panel configuration

**Files:**
- Modify: `backend/src/types.ts:118-127` (`ADMIN_CAPABILITIES`, `ADMIN_OPERATIONS`), `backend/src/types.ts:144-160` (`SecretBindings`, `RuntimeConfigBindings`)
- Modify: `backend/tests/helpers/env.ts:20-106` (`createTestEnv`)
- Test: none (pure type/constant change with no independent behavior; covered by every later task's tests failing to compile/run without it)

**Interfaces:**
- Produces: `AdminCapability` now includes `'admin-panel'`; `AdminOperation` now includes `'panel.health'` and `'panel.llm_test'`; `Env` now includes `ADMIN_PANEL_ALLOWED_EMAILS: string` (secret) and `ADMIN_PANEL_FIREBASE_PROJECT_ID: string` (runtime config). `createTestEnv()` returns both with usable defaults so every later test file gets them for free.

- [ ] **Step 1: Add the new capability and operations**

In `backend/src/types.ts`, change:

```ts
export const ADMIN_CAPABILITIES = ['content-ops', 'notification-ops', 'play-read', 'play-write'] as const;
export const ADMIN_OPERATIONS = [
  'content.backfill',
  'content.cache_bypass',
  'notification.send',
  'play.subscription_list',
  'play.subscription_update',
  'play.subscription_audit',
  'play.review_list',
  'play.review_reply'
] as const;
```

to:

```ts
export const ADMIN_CAPABILITIES = ['content-ops', 'notification-ops', 'play-read', 'play-write', 'admin-panel'] as const;
export const ADMIN_OPERATIONS = [
  'content.backfill',
  'content.cache_bypass',
  'notification.send',
  'play.subscription_list',
  'play.subscription_update',
  'play.subscription_audit',
  'play.review_list',
  'play.review_reply',
  'panel.health',
  'panel.llm_test'
] as const;
```

- [ ] **Step 2: Add the two new Env bindings**

In `backend/src/types.ts`, change:

```ts
interface SecretBindings {
  JWT_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  ADMIN_CONTENT_SECRET: string;
  ADMIN_NOTIFICATION_SECRET: string;
  ADMIN_PLAY_READ_SECRET: string;
  ADMIN_PLAY_WRITE_SECRET: string;
  ADMOB_REWARDED_ID: string;
  /** Base64-encoded 32-byte (AES-256) key. Generate with `openssl rand -base64 32`. See services/birthDataEncryption.ts. */
  BIRTH_DATA_ENCRYPTION_KEY: string;
}

interface RuntimeConfigBindings {
  PLAY_RTDN_AUDIENCE: string;
  PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: string;
}
```

to:

```ts
interface SecretBindings {
  JWT_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  ADMIN_CONTENT_SECRET: string;
  ADMIN_NOTIFICATION_SECRET: string;
  ADMIN_PLAY_READ_SECRET: string;
  ADMIN_PLAY_WRITE_SECRET: string;
  /** Comma-separated allowlist of Firebase account emails permitted to call /admin/panel/*. */
  ADMIN_PANEL_ALLOWED_EMAILS: string;
  ADMOB_REWARDED_ID: string;
  /** Base64-encoded 32-byte (AES-256) key. Generate with `openssl rand -base64 32`. See services/birthDataEncryption.ts. */
  BIRTH_DATA_ENCRYPTION_KEY: string;
}

interface RuntimeConfigBindings {
  PLAY_RTDN_AUDIENCE: string;
  PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: string;
  /** Firebase project ID the admin-notifications panel signs into. Not a secret — already public in that panel's bundled JS. */
  ADMIN_PANEL_FIREBASE_PROJECT_ID: string;
}
```

- [ ] **Step 3: Add defaults to the test env helper**

In `backend/tests/helpers/env.ts`, inside the object returned by `createTestEnv`, add two lines right after `ADMIN_PLAY_WRITE_SECRET: 'play-write-secret',`:

```ts
    ADMIN_PLAY_WRITE_SECRET: 'play-write-secret',
    ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com',
    ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-demo-project',
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `cd backend && npm run build`
Expected: succeeds (this step only adds fields/union members; nothing yet references them incorrectly).

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/types.ts tests/helpers/env.ts
git commit -m "feat(admin-panel): add admin-panel capability, operations, and env bindings"
```

---

### Task 2: Add project-scoped Firebase ID token verification for the admin panel's identity

**Files:**
- Modify: `backend/src/utils/jwt.ts:112-129` (`verifyFirebaseIdToken`)
- Test: `backend/tests/utils/jwtAdminPanel.test.ts` (new)

**Interfaces:**
- Consumes: `resolveFirebaseVerificationKey(env, token)` (existing, `backend/src/utils/jwt.ts:67`, unchanged) and `getGoogleServiceAccount(raw)` (existing, `backend/src/utils/jwt.ts:14`, unchanged).
- Produces: `verifyAdminPanelIdentity(env: Env, token: string): Promise<{ sub: string; email?: string; emailVerified: boolean }>` — exported from `@/utils/jwt`, throws on any verification failure (bad signature, wrong project, expired, malformed). `verifyFirebaseIdToken`'s existing exported signature and `FirebaseIdTokenClaims` return shape are unchanged; Task 3 imports `verifyAdminPanelIdentity` from this module.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/utils/jwtAdminPanel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
    jwtVerify: jwtVerifyMock,
    importX509: vi.fn().mockResolvedValue('fake-crypto-key')
  };
});

import { verifyAdminPanelIdentity, verifyFirebaseIdToken } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

function fakeToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString('base64url');
  return `${header}.payload.signature`;
}

function mockCertResponse() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ 'test-kid': '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----' })
  );
}

describe('verifyAdminPanelIdentity', () => {
  it('verifies against ADMIN_PANEL_FIREBASE_PROJECT_ID, not the app Firebase project', async () => {
    const env = createTestEnv({ ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project' });
    mockCertResponse();
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'panel-user-1', email: 'ops@example.com', email_verified: true }
    });

    const identity = await verifyAdminPanelIdentity(env, fakeToken());

    expect(identity).toEqual({ sub: 'panel-user-1', email: 'ops@example.com', emailVerified: true });
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      'fake-crypto-key',
      expect.objectContaining({
        algorithms: ['RS256'],
        issuer: 'https://securetoken.google.com/panel-project',
        audience: 'panel-project'
      })
    );
  });

  it('defaults email to undefined and emailVerified to false when the claims omit them', async () => {
    const env = createTestEnv({ ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project' });
    mockCertResponse();
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'panel-user-2' } });

    const identity = await verifyAdminPanelIdentity(env, fakeToken());

    expect(identity).toEqual({ sub: 'panel-user-2', email: undefined, emailVerified: false });
  });

  it('propagates verification failures (expired token, bad signature)', async () => {
    const env = createTestEnv({ ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project' });
    mockCertResponse();
    jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

    await expect(verifyAdminPanelIdentity(env, fakeToken())).rejects.toThrow();
  });
});

describe('verifyFirebaseIdToken (regression)', () => {
  it('still verifies against the app\'s own FIREBASE_SERVICE_ACCOUNT_JSON project, unchanged', async () => {
    const env = createTestEnv();
    mockCertResponse();
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'app-user-1', aud: 'demo-project', iss: 'https://securetoken.google.com/demo-project' }
    });

    const claims = await verifyFirebaseIdToken(env, fakeToken());

    expect(claims).toEqual({
      aud: 'demo-project',
      iss: 'https://securetoken.google.com/demo-project',
      sub: 'app-user-1',
      user_id: undefined,
      firebase: undefined
    });
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      'fake-crypto-key',
      expect.objectContaining({
        issuer: 'https://securetoken.google.com/demo-project',
        audience: 'demo-project'
      })
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run tests/utils/jwtAdminPanel.test.ts`
Expected: FAIL — `verifyAdminPanelIdentity` is not exported from `@/utils/jwt`.

- [ ] **Step 3: Extract the project-parameterized verification core and add `verifyAdminPanelIdentity`**

In `backend/src/utils/jwt.ts`, replace:

```ts
export async function verifyFirebaseIdToken(env: Env, token: string): Promise<FirebaseIdTokenClaims> {
  const account = getGoogleServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const issuer = `https://securetoken.google.com/${account.project_id}`;
  const key = await resolveFirebaseVerificationKey(env, token);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    issuer,
    audience: account.project_id
  });

  if (!payload.sub) {
    throw new Error('Firebase token subject is missing.');
  }

  return {
    aud: Array.isArray(payload.aud) ? payload.aud[0] : String(payload.aud ?? ''),
    iss: String(payload.iss ?? ''),
    sub: String(payload.sub),
    user_id: payload['user_id'] != null ? String(payload['user_id']) : undefined,
    firebase: (payload['firebase'] as FirebaseIdTokenClaims['firebase']) ?? undefined,
  };
}
```

with:

```ts
interface VerifiedFirebaseToken {
  aud: string;
  iss: string;
  sub: string;
  user_id?: string;
  email?: string;
  emailVerified: boolean;
  firebase?: { sign_in_provider?: string };
}

/**
 * Shared JWKS/signature verification core. Google's certificate endpoint is
 * shared across every Firebase project, so only the issuer/audience check is
 * project-specific — callers supply which project's tokens they trust.
 */
async function verifyFirebaseIdTokenForProject(
  env: Env,
  token: string,
  projectId: string
): Promise<VerifiedFirebaseToken> {
  const issuer = `https://securetoken.google.com/${projectId}`;
  const key = await resolveFirebaseVerificationKey(env, token);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    issuer,
    audience: projectId
  });

  if (!payload.sub) {
    throw new Error('Firebase token subject is missing.');
  }

  return {
    aud: Array.isArray(payload.aud) ? payload.aud[0] : String(payload.aud ?? ''),
    iss: String(payload.iss ?? ''),
    sub: String(payload.sub),
    user_id: payload['user_id'] != null ? String(payload['user_id']) : undefined,
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    emailVerified: payload['email_verified'] === true,
    firebase: (payload['firebase'] as VerifiedFirebaseToken['firebase']) ?? undefined
  };
}

export async function verifyFirebaseIdToken(env: Env, token: string): Promise<FirebaseIdTokenClaims> {
  const account = getGoogleServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const verified = await verifyFirebaseIdTokenForProject(env, token, account.project_id);

  return {
    aud: verified.aud,
    iss: verified.iss,
    sub: verified.sub,
    user_id: verified.user_id,
    firebase: verified.firebase
  };
}

/**
 * Verifies a Firebase ID token issued by the admin-notifications panel's OWN
 * Firebase project (ADMIN_PANEL_FIREBASE_PROJECT_ID) — a different project
 * than Astroloji's own end-user Firebase project. Used only by
 * requireAdminPanelAuth (middleware/auth.ts).
 */
export async function verifyAdminPanelIdentity(
  env: Env,
  token: string
): Promise<{ sub: string; email?: string; emailVerified: boolean }> {
  const verified = await verifyFirebaseIdTokenForProject(env, token, env.ADMIN_PANEL_FIREBASE_PROJECT_ID);
  return { sub: verified.sub, email: verified.email, emailVerified: verified.emailVerified };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/utils/jwtAdminPanel.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full jwt test file to confirm no regression**

Run: `cd backend && npx vitest run tests/utils/jwt.test.ts tests/workers/user.test.ts`
Expected: PASS — `verifyFirebaseIdToken`'s existing callers and its own pre-existing tests are unaffected.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/utils/jwt.ts tests/utils/jwtAdminPanel.test.ts
git commit -m "feat(admin-panel): verify admin panel identity against its own Firebase project"
```

---

### Task 3: Add the `requireAdminPanelAuth` middleware

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Test: `backend/tests/middleware/adminPanelAuth.test.ts` (new)

**Interfaces:**
- Consumes: `verifyAdminPanelIdentity(env, token)` from Task 2, `getBearerToken` (existing, `backend/src/middleware/auth.ts:22`), `logAdminOperation` (existing, `backend/src/services/adminAudit.ts:17`), `jsonError` (existing, private to this file).
- Produces: `requireAdminPanelAuth(operation: AdminOperation): AppMiddleware`, exported from `@/middleware/auth`. Task 4 mounts it on the two new routes, e.g. `requireAdminPanelAuth('panel.health')`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/middleware/adminPanelAuth.test.ts`:

```ts
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { verifyAdminPanelIdentityMock } = vi.hoisted(() => ({
  verifyAdminPanelIdentityMock: vi.fn()
}));

vi.mock('@/utils/jwt', async () => {
  const actual = await vi.importActual<typeof import('@/utils/jwt')>('@/utils/jwt');
  return {
    ...actual,
    verifyAdminPanelIdentity: verifyAdminPanelIdentityMock
  };
});

import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings } from '@/types';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv({ ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com, second@example.com' });
}

function protectedApp(status = 200) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'request-123');
    c.set('bypassCache', false);
    await next();
  });
  app.get('/protected', requireAdminPanelAuth('panel.health'), (c) =>
    c.json({ ok: status < 400 }, status as 200 | 400 | 500)
  );
  return app;
}

function adminEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map(([entry]) => entry)
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      'event' in entry &&
      (entry as Record<string, unknown>).event === 'admin_operation'
    );
}

afterEach(() => {
  vi.restoreAllMocks();
  verifyAdminPanelIdentityMock.mockReset();
});

describe('requireAdminPanelAuth', () => {
  it('authorizes a verified, allowlisted identity and emits sanitized audit events', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-1',
      email: 'ops@example.com',
      emailVerified: true
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );

    expect(response.status).toBe(200);
    const events = adminEvents(log);
    expect(events.map((event) => event.outcome)).toEqual(['authorized', 'completed']);
    expect(events.every((event) => event.capability === 'admin-panel' && event.operation === 'panel.health')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('ops@example.com');
    expect(JSON.stringify(events)).not.toContain('test-token');
  });

  it('rejects with 401 when the authorization header is missing', async () => {
    const response = await protectedApp().request('/protected', {}, env());
    expect(response.status).toBe(401);
    expect(verifyAdminPanelIdentityMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token verification fails', async () => {
    verifyAdminPanelIdentityMock.mockRejectedValue(new Error('token expired'));
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer bad-token' } },
      env()
    );
    expect(response.status).toBe(401);
  });

  it('rejects with 403 when the email is not in the allowlist', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-2',
      email: 'stranger@example.com',
      emailVerified: true
    });
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );
    expect(response.status).toBe(403);
  });

  it('rejects with 403 when the email is not verified', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-3',
      email: 'ops@example.com',
      emailVerified: false
    });
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );
    expect(response.status).toBe(403);
  });

  it('classifies downstream failures as failed, never completed', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-1',
      email: 'ops@example.com',
      emailVerified: true
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp(500).request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );

    expect(response.status).toBe(500);
    expect(adminEvents(log).map((event) => event.outcome)).toEqual(['authorized', 'failed']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run tests/middleware/adminPanelAuth.test.ts`
Expected: FAIL — `requireAdminPanelAuth` is not exported from `@/middleware/auth`.

- [ ] **Step 3: Implement the middleware**

In `backend/src/middleware/auth.ts`, add the import and the new middleware. Change the import line:

```ts
import { verifyAppJwt } from '@/utils/jwt';
```

to:

```ts
import { verifyAdminPanelIdentity, verifyAppJwt } from '@/utils/jwt';
```

Then add, after `requireAdminCapability`'s definition (after line 101, before `contentCacheBypassMiddleware`):

```ts
function resolveAdminPanelAllowedEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function runAdminPanelAuth(c: AppContext, next: Next, operation: AdminOperation): Promise<Response | void> {
  const audit = (outcome: 'authorized' | 'rejected' | 'completed' | 'failed') =>
    logAdminOperation({ requestId: c.get('requestId'), capability: 'admin-panel', operation, outcome });

  const token = getBearerToken(c.req.header('authorization'));
  if (!token) {
    audit('rejected');
    return jsonError(c, 401, 'UNAUTHORIZED', 'Missing authorization header.');
  }

  let identity: { sub: string; email?: string; emailVerified: boolean };
  try {
    identity = await verifyAdminPanelIdentity(c.env, token);
  } catch {
    audit('rejected');
    return jsonError(c, 401, 'INVALID_TOKEN', 'Authorization token is invalid or expired.');
  }

  const allowedEmails = resolveAdminPanelAllowedEmails(c.env.ADMIN_PANEL_ALLOWED_EMAILS);
  const email = identity.email?.toLowerCase();
  if (!identity.emailVerified || !email || !allowedEmails.includes(email)) {
    audit('rejected');
    return jsonError(c, 403, 'FORBIDDEN', 'This account is not authorized for the admin panel.');
  }

  audit('authorized');
  try {
    await next();
    audit(c.res.status < 400 ? 'completed' : 'failed');
  } catch (error) {
    audit('failed');
    throw error;
  }
}

export function requireAdminPanelAuth(operation: AdminOperation): AppMiddleware {
  return (c, next) => runAdminPanelAuth(c, next, operation);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/middleware/adminPanelAuth.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full middleware test suite to confirm no regression**

Run: `cd backend && npx vitest run tests/middleware/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/middleware/auth.ts tests/middleware/adminPanelAuth.test.ts
git commit -m "feat(admin-panel): add requireAdminPanelAuth middleware"
```

---

### Task 4: Add `GET /api/v1/admin/panel/health`

**Files:**
- Create: `backend/src/workers/adminPanel.ts`
- Modify: `backend/src/index.ts` (register the new routes)
- Test: `backend/tests/workers/adminPanel.test.ts` (new)

**Interfaces:**
- Consumes: `requireAdminPanelAuth` (Task 3), `buildDailyContentProviderChain(env)` (existing, `@/llm/dailyContentProviderChain`), `buildReadingProviderChain(env)` (existing, `@/llm/readingProviderChain`).
- Produces: `registerAdminPanelRoutes(app: Hono<AppBindings>)`, exported from `@/workers/adminPanel`. Task 5 adds the second route inside the same function/file.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/workers/adminPanel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const { verifyAdminPanelIdentityMock } = vi.hoisted(() => ({
  verifyAdminPanelIdentityMock: vi.fn()
}));

vi.mock('@/utils/jwt', async () => {
  const actual = await vi.importActual<typeof import('@/utils/jwt')>('@/utils/jwt');
  return {
    ...actual,
    verifyAdminPanelIdentity: verifyAdminPanelIdentityMock
  };
});

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv({ ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com' });
}

function authorize() {
  verifyAdminPanelIdentityMock.mockResolvedValue({
    sub: 'panel-uid-1',
    email: 'ops@example.com',
    emailVerified: true
  });
}

describe('GET /api/v1/admin/panel/health', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/admin/panel/health', {}, env());
    expect(response.status).toBe(401);
  });

  it('reports db, kv, and llm provider chain composition when authorized', async () => {
    authorize();
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/panel/health',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'ok',
      db: true,
      kv: true,
      llmProviders: {
        daily_content: ['workers-ai'],
        deep_reading: ['workers-ai'],
        chat_consultation: ['workers-ai']
      }
    });
    expect(typeof body.timestamp).toBe('string');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run tests/workers/adminPanel.test.ts`
Expected: FAIL — `/api/v1/admin/panel/health` does not exist (404).

- [ ] **Step 3: Implement the route**

Create `backend/src/workers/adminPanel.ts`:

```ts
import type { Hono } from 'hono';

import { buildDailyContentProviderChain } from '@/llm/dailyContentProviderChain';
import { buildReadingProviderChain } from '@/llm/readingProviderChain';
import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings, AppContext } from '@/types';

const ADMIN_PANEL_HEALTH_CACHE_KEY = 'admin_panel_health_canary';

async function checkDb(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return row?.ok === 1;
  } catch {
    return false;
  }
}

async function checkKv(cache: KVNamespace): Promise<boolean> {
  try {
    await cache.put(ADMIN_PANEL_HEALTH_CACHE_KEY, '1', { expirationTtl: 60 });
    return (await cache.get(ADMIN_PANEL_HEALTH_CACHE_KEY)) === '1';
  } catch {
    return false;
  }
}

function providerChainIds(c: AppContext) {
  const readingIds = buildReadingProviderChain(c.env).map((provider) => provider.id);
  return {
    daily_content: buildDailyContentProviderChain(c.env).map((provider) => provider.id),
    deep_reading: readingIds,
    chat_consultation: readingIds
  };
}

export function registerAdminPanelRoutes(app: Hono<AppBindings>) {
  app.get('/admin/panel/health', requireAdminPanelAuth('panel.health'), async (c) => {
    const [dbOk, kvOk] = await Promise.all([checkDb(c.env.DB), checkKv(c.env.CACHE)]);

    return c.json({
      status: dbOk && kvOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbOk,
      kv: kvOk,
      llmProviders: providerChainIds(c)
    });
  });
}
```

Then, in `backend/src/index.ts`, add the import alongside the other worker registrations:

```ts
import { registerAdminPanelRoutes } from '@/workers/adminPanel';
```

and register it alongside the other admin route registrations:

```ts
  registerAdminPanelRoutes(apiAdminRoutes);
  registerContentAdminRoutes(apiAdminRoutes);
  registerNotificationRoutes(apiAdminRoutes);
  registerSubscriptionAdminRoutes(apiAdminRoutes);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run tests/workers/adminPanel.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full worker test suite and typecheck to confirm no regression**

Run: `cd backend && npx vitest run tests/workers/ && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/workers/adminPanel.ts src/index.ts tests/workers/adminPanel.test.ts
git commit -m "feat(admin-panel): add GET /admin/panel/health"
```

---

### Task 5: Add `POST /api/v1/admin/panel/llm/test`

**Files:**
- Modify: `backend/src/workers/adminPanel.ts` (Task 4)
- Modify: `backend/src/utils/validators.ts` (add request validation)
- Test: `backend/tests/workers/adminPanel.test.ts` (Task 4, extended)

**Interfaces:**
- Consumes: `routeLlmGenerate(providers, request)` (existing, `@/llm/router`), `LlmGenerateRequest` (existing, `@/llm/provider`), `validateAdminPanelLlmTestBody` (new, this task).
- Produces: the route itself; nothing later depends on new exports from this task.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/workers/adminPanel.test.ts` (inside the existing file, after the `describe('GET ...')` block):

```ts
describe('POST /api/v1/admin/panel/llm/test', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskType: 'daily_content' }) },
      env()
    );
    expect(response.status).toBe(401);
  });

  it('rejects an unknown taskType with 400', async () => {
    authorize();
    const app = createApp();
    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'not-a-real-task' })
      },
      env()
    );
    expect(response.status).toBe(400);
  });

  it('returns the provider fallback attempts when every provider fails', async () => {
    authorize();
    const failingEnv = createTestEnv({
      ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com',
      AI: {
        async run() {
          throw new Error('simulated provider outage');
        }
      } as unknown as ReturnType<typeof createTestEnv>['AI']
    });
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'daily_content' })
      },
      failingEnv
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.succeeded).toBe(false);
    expect(body.providerId).toBeNull();
    expect(body.attempts).toEqual([{ providerId: 'workers-ai', error: expect.stringContaining('simulated provider outage') }]);
  });

  it('succeeds with a provider id, text, and usage when the chain responds, and never records budget usage', async () => {
    authorize();
    const cachePutSpy = vi.fn();
    const workingEnv = createTestEnv({
      ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com',
      AI: {
        async run() {
          return { response: 'ok', usage: { prompt_tokens: 12, completion_tokens: 1 } };
        }
      } as unknown as ReturnType<typeof createTestEnv>['AI'],
      CACHE: {
        async get() {
          return null;
        },
        put: cachePutSpy,
        async delete() {
          return;
        }
      } as unknown as ReturnType<typeof createTestEnv>['CACHE']
    });
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'deep_reading' })
      },
      workingEnv
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      succeeded: true,
      providerId: 'workers-ai',
      text: 'ok',
      usage: { inputTokens: 12, outputTokens: 1 },
      attempts: []
    });
    // routeLlmGenerate (not routeLlmGenerateForUser) never touches CACHE, so no budget
    // write can occur — this route must not record usage against any real user's cap.
    expect(cachePutSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run tests/workers/adminPanel.test.ts`
Expected: FAIL — `/api/v1/admin/panel/llm/test` does not exist (404).

- [ ] **Step 3: Add request validation**

In `backend/src/utils/validators.ts`, add near the other `validate*Body` functions (after `validateNatalChartBody`):

```ts
const adminPanelLlmTestSchema = z.object({
  taskType: z.enum(['daily_content', 'deep_reading', 'chat_consultation'])
});

export type AdminPanelLlmTestRequest = z.infer<typeof adminPanelLlmTestSchema>;

export function validateAdminPanelLlmTestBody(payload: unknown): AdminPanelLlmTestRequest {
  return adminPanelLlmTestSchema.parse(payload);
}
```

(If `z` is not already imported at the top of this file, add `import { z } from 'zod';` — check first, most validator files in this repo already import it.)

- [ ] **Step 4: Implement the route**

In `backend/src/workers/adminPanel.ts`, add the imports:

```ts
import type { LlmGenerateRequest } from '@/llm/provider';
import { routeLlmGenerate } from '@/llm/router';
import { validateAdminPanelLlmTestBody, type AdminPanelLlmTestRequest } from '@/utils/validators';
```

Add this constant above `registerAdminPanelRoutes`:

```ts
const ADMIN_PANEL_LLM_TEST_MESSAGE = {
  system: 'You are a connectivity check. Reply with exactly one lowercase word and nothing else.',
  user: 'Reply with the word: ok'
};

const ADMIN_PANEL_LLM_TEST_PROMPTS: Record<AdminPanelLlmTestRequest['taskType'], LlmGenerateRequest> = {
  daily_content: {
    taskType: 'daily_content',
    messages: [
      { role: 'system', content: ADMIN_PANEL_LLM_TEST_MESSAGE.system },
      { role: 'user', content: ADMIN_PANEL_LLM_TEST_MESSAGE.user }
    ],
    maxOutputTokens: 16
  },
  deep_reading: {
    taskType: 'deep_reading',
    messages: [
      { role: 'system', content: ADMIN_PANEL_LLM_TEST_MESSAGE.system },
      { role: 'user', content: ADMIN_PANEL_LLM_TEST_MESSAGE.user }
    ],
    maxOutputTokens: 16
  },
  chat_consultation: {
    taskType: 'chat_consultation',
    messages: [
      { role: 'system', content: ADMIN_PANEL_LLM_TEST_MESSAGE.system },
      { role: 'user', content: ADMIN_PANEL_LLM_TEST_MESSAGE.user }
    ],
    maxOutputTokens: 16
  }
};
```

Then add the route inside `registerAdminPanelRoutes`, after the health route:

```ts
  app.post('/admin/panel/llm/test', requireAdminPanelAuth('panel.llm_test'), async (c) => {
    const body = validateAdminPanelLlmTestBody(await c.req.json());
    const providers =
      body.taskType === 'daily_content'
        ? buildDailyContentProviderChain(c.env)
        : buildReadingProviderChain(c.env);
    const routed = await routeLlmGenerate(providers, ADMIN_PANEL_LLM_TEST_PROMPTS[body.taskType]);

    return c.json({
      succeeded: routed.result !== null,
      providerId: routed.result?.providerId ?? null,
      text: routed.result?.text ?? null,
      usage: routed.result?.usage ?? null,
      attempts: routed.attempts
    });
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/workers/adminPanel.test.ts`
Expected: PASS (6 tests total in the file)

- [ ] **Step 6: Run the full backend test suite and build to confirm no regression**

Run: `cd backend && npm run build && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/workers/adminPanel.ts src/utils/validators.ts tests/workers/adminPanel.test.ts
git commit -m "feat(admin-panel): add POST /admin/panel/llm/test"
```

---

### Task 6: Wire deployment plumbing for the two new configuration values

**Files:**
- Modify: `backend/scripts/shared.ts` (`CLOUDFLARE_SECRET_NAMES`)
- Modify: `backend/scripts/deploy-worker.ts` (`buildWorkerDeployArgs`)
- Modify: `.github/workflows/backend-production-deploy.yml`
- Test: `backend/tests/scripts/deployWorker.test.ts` (already exists — covers the two pre-existing RTDN vars; append a new `describe` block for the admin-panel var, do not replace the file), `scripts/backend-production-deploy-workflow.test.mjs` (extended)

**Interfaces:**
- Produces: `ADMIN_PANEL_ALLOWED_EMAILS` flows through the existing Doppler → `wrangler secret put` pipeline (`npm run doppler:cf-secrets`); `ADMIN_PANEL_FIREBASE_PROJECT_ID` flows through the existing GitHub-Actions-repo-variable → `wrangler deploy --var` pipeline (`npm run deploy:doppler`).

- [ ] **Step 1: Write the failing test for `buildWorkerDeployArgs`**

`backend/tests/scripts/deployWorker.test.ts` already exists (it covers `PLAY_RTDN_AUDIENCE`/`PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` today) — do not overwrite it. Append this new `describe` block at the end of the file, after the existing `describe('Worker deploy runtime configuration', ...)` block:

```ts
describe('buildWorkerDeployArgs admin panel variable', () => {
  function baseEnv(): NodeJS.ProcessEnv {
    return {
      PLAY_RTDN_AUDIENCE: 'https://example.test/api/v1/webhooks/play-rtdn',
      PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: 'play-rtdn-push@example-project.iam.gserviceaccount.com',
      ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project'
    };
  }

  it('passes the admin panel Firebase project id as a deploy-time var', () => {
    const args = buildWorkerDeployArgs(baseEnv());
    expect(args).toContain('ADMIN_PANEL_FIREBASE_PROJECT_ID:panel-project');
  });

  it('throws when ADMIN_PANEL_FIREBASE_PROJECT_ID is missing', () => {
    const env = baseEnv();
    delete env.ADMIN_PANEL_FIREBASE_PROJECT_ID;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/ADMIN_PANEL_FIREBASE_PROJECT_ID/);
  });

  it('still requires the pre-existing RTDN variables', () => {
    const env = baseEnv();
    delete env.PLAY_RTDN_AUDIENCE;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/PLAY_RTDN_AUDIENCE/);
  });
});
```

No new imports are needed — `describe`, `expect`, `it`, and `buildWorkerDeployArgs` are already imported at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run tests/scripts/deployWorker.test.ts`
Expected: FAIL — the built args do not contain `ADMIN_PANEL_FIREBASE_PROJECT_ID:panel-project`.

- [ ] **Step 3: Extend `buildWorkerDeployArgs`**

In `backend/scripts/deploy-worker.ts`, change:

```ts
const RTDN_RUNTIME_VARIABLES = [
  'PLAY_RTDN_AUDIENCE',
  'PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'
] as const;
```

to:

```ts
const RTDN_RUNTIME_VARIABLES = [
  'PLAY_RTDN_AUDIENCE',
  'PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'
] as const;

const ADMIN_PANEL_RUNTIME_VARIABLES = ['ADMIN_PANEL_FIREBASE_PROJECT_ID'] as const;
```

and change:

```ts
export function buildWorkerDeployArgs(environment: NodeJS.ProcessEnv): string[] {
  for (const name of RTDN_RUNTIME_VARIABLES) {
    if (!environment[name]) {
      throw new Error(`Missing required Worker runtime variable: ${name}`);
    }
  }
  return [
    'wrangler',
    'deploy',
    '--var',
    `PLAY_RTDN_AUDIENCE:${environment.PLAY_RTDN_AUDIENCE}`,
    '--var',
    `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`
  ];
}
```

to:

```ts
export function buildWorkerDeployArgs(environment: NodeJS.ProcessEnv): string[] {
  for (const name of [...RTDN_RUNTIME_VARIABLES, ...ADMIN_PANEL_RUNTIME_VARIABLES]) {
    if (!environment[name]) {
      throw new Error(`Missing required Worker runtime variable: ${name}`);
    }
  }
  return [
    'wrangler',
    'deploy',
    '--var',
    `PLAY_RTDN_AUDIENCE:${environment.PLAY_RTDN_AUDIENCE}`,
    '--var',
    `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`,
    '--var',
    `ADMIN_PANEL_FIREBASE_PROJECT_ID:${environment.ADMIN_PANEL_FIREBASE_PROJECT_ID}`
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run tests/scripts/deployWorker.test.ts`
Expected: PASS (7 tests: 4 pre-existing + 3 new)

- [ ] **Step 5: Add `ADMIN_PANEL_ALLOWED_EMAILS` to the Doppler-synced secret list**

In `backend/scripts/shared.ts`, change:

```ts
export const CLOUDFLARE_SECRET_NAMES = [
  'JWT_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'ADMOB_REWARDED_ID',
  'BIRTH_DATA_ENCRYPTION_KEY',
] as const;
```

to:

```ts
export const CLOUDFLARE_SECRET_NAMES = [
  'JWT_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'ADMOB_REWARDED_ID',
  'BIRTH_DATA_ENCRYPTION_KEY',
  'ADMIN_PANEL_ALLOWED_EMAILS',
] as const;
```

- [ ] **Step 6: Run the existing shared-secrets test suite to confirm no regression**

Run: `cd backend && npx vitest run tests/scripts/shared.test.ts`
Expected: PASS — the existing "keeps all admin credentials out of the generic deploy allowlist" test only excludes the four `ADMIN_*_SECRET` capability secrets by name; `ADMIN_PANEL_ALLOWED_EMAILS` is not one of them, so this test is unaffected.

- [ ] **Step 7: Wire the new runtime variable through the production deploy workflow**

In `.github/workflows/backend-production-deploy.yml`, change:

```yaml
      PLAY_RTDN_AUDIENCE: ${{ vars.PLAY_RTDN_AUDIENCE }}
      PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: ${{ vars.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL }}
```

to:

```yaml
      PLAY_RTDN_AUDIENCE: ${{ vars.PLAY_RTDN_AUDIENCE }}
      PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: ${{ vars.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL }}
      ADMIN_PANEL_FIREBASE_PROJECT_ID: ${{ vars.ADMIN_PANEL_FIREBASE_PROJECT_ID }}
```

and change:

```yaml
          for name in DOPPLER_TOKEN DOPPLER_PROJECT DOPPLER_CONFIG CLOUDFLARE_ACCOUNT_ID PLAY_RTDN_AUDIENCE PLAY_RTDN_SERVICE_ACCOUNT_EMAIL; do
```

to:

```yaml
          for name in DOPPLER_TOKEN DOPPLER_PROJECT DOPPLER_CONFIG CLOUDFLARE_ACCOUNT_ID PLAY_RTDN_AUDIENCE PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ADMIN_PANEL_FIREBASE_PROJECT_ID; do
```

- [ ] **Step 8: Extend the workflow text-assertion test**

In `scripts/backend-production-deploy-workflow.test.mjs`, add a new test at the end of the file:

```js
test('backend production deploy passes the admin panel Firebase project id to the Worker deploy step', () => {
  assert.match(workflow, /ADMIN_PANEL_FIREBASE_PROJECT_ID: \$\{\{ vars\.ADMIN_PANEL_FIREBASE_PROJECT_ID \}\}/);
  assert.match(workflow, /PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ADMIN_PANEL_FIREBASE_PROJECT_ID/);
});
```

- [ ] **Step 9: Run the workflow assertion tests**

Run: `cd /home/msi/Desktop/MOBILE_PROJECTS/Astroloji && node --test scripts/*.test.mjs`
Expected: PASS

- [ ] **Step 10: Commit the code and workflow changes**

```bash
cd /home/msi/Desktop/MOBILE_PROJECTS/Astroloji
git add backend/scripts/shared.ts backend/scripts/deploy-worker.ts backend/tests/scripts/deployWorker.test.ts .github/workflows/backend-production-deploy.yml scripts/backend-production-deploy-workflow.test.mjs
git commit -m "feat(admin-panel): wire ADMIN_PANEL_ALLOWED_EMAILS and ADMIN_PANEL_FIREBASE_PROJECT_ID through deployment"
```

- [ ] **Step 11 (manual, operator-only — not code): provision the real values**

This step cannot be automated by an engineer with no access to the target Firebase project or Doppler account; it must be done by whoever has both. Three values need real production data before the panel can actually call these routes from a browser:

1. **`ADMIN_PANEL_FIREBASE_PROJECT_ID`** — the Firebase project ID the admin-notifications panel signs into (found in that repo's deployed `VITE_FIREBASE_PROJECT_ID` or its CI secrets). Set it as a GitHub Actions repository variable:
   ```bash
   gh variable set ADMIN_PANEL_FIREBASE_PROJECT_ID --repo MakerParsDev/Astroloji --body "<real-project-id>"
   ```
2. **`ADMIN_PANEL_ALLOWED_EMAILS`** — the comma-separated list of Firebase account emails allowed to use the panel (the operator's own sign-in email at minimum). Add it to the `mobil-apps/astrology` Doppler config (same project/config the other backend secrets already live in), matching the existing secret-provisioning pattern used for `JWT_SECRET` etc.:
   ```bash
   doppler secrets set ADMIN_PANEL_ALLOWED_EMAILS --project mobil-apps --config astrology
   ```
3. ~~**The panel's deployed origin must be added to `ALLOWED_ORIGINS`.**~~ **Done.** Confirmed the panel is live at `https://admin.parsfilo.com` (served `<title>Notifications Admin</title>` with a `firebase-vendor` bundle chunk, matching `side-projects/admin-notifications/` in the framework repo) and added it to `backend/wrangler.toml:35`: `ALLOWED_ORIGINS = "https://astrology.parsfilo.com,https://admin.parsfilo.com"`.

All three provisioning items are now complete:
1. `ADMIN_PANEL_FIREBASE_PROJECT_ID` = `makerpars-oaslananka-mobil` — set as a GitHub Actions repo variable (confirmed via `firebase projects:list` — the only project visible to the operator's Firebase CLI login, matching the framework repo's naming convention).
2. `ADMIN_PANEL_ALLOWED_EMAILS` = `oaslananka@gmail.com` — set in the `mobil-apps/astrology` Doppler config.
3. `ALLOWED_ORIGINS` in `backend/wrangler.toml` now includes `https://admin.parsfilo.com`.

None of the three values were needed for the automated test suite (Tasks 1–6 use `createTestEnv` defaults) or for `npm run build`/`npm test` to pass — they only gate the admin panel actually reaching these routes in production. The `wrangler.toml` change (item 3) takes effect on the next backend deploy; items 1–2 take effect on the next `backend-production-deploy` workflow run / `npm run doppler:cf-secrets` sync.

---

## Definition of done

- All six tasks' tests pass: `cd backend && npm run build && npm test`
- `cd /home/msi/Desktop/MOBILE_PROJECTS/Astroloji && node --test scripts/*.test.mjs` passes
- `requireAdminPanelAuth`, `verifyAdminPanelIdentity`, and both new routes exist on `main` with every case from the spec's "Admin-panel-auth verification" list covered by an automated test (Tasks 2–3 cover all of them: wrong-project rejection, allowlist rejection, unverified-email rejection, expired-token rejection, malformed-header rejection, full-chain-failure 200 response, no-budget-recording, sanitized audit log).
- `ADMIN_PANEL_ALLOWED_EMAILS` and `ADMIN_PANEL_FIREBASE_PROJECT_ID` are wired through the deployment pipeline in code (Task 6, Steps 1–10); the operator has separately provisioned their real values (Task 6, Step 11) before the next production deploy.
- The panel-side PR against `MakerParsDev/android-multi-app-framework` is explicit follow-up work, not part of this plan's completion.
