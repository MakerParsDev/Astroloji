# Admin Panel Cloudflare Access Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase Auth with Cloudflare Access as the identity/authorization mechanism across all three admin surfaces — Astroloji's backend, the `contentapp-admin-api` Worker, and the `admin-notifications` React panel — so no admin route anywhere depends on Firebase ID tokens, Firestore `admins` allowlist docs, or the (billing-broken) Firebase Cloud Functions admin check.

**Architecture:** Three Cloudflare Access Applications already exist (created during planning, real values below) gating three origins. Each backend verifies the `Cf-Access-Jwt-Assertion` header Cloudflare injects after a successful Access login, checking signature + issuer + this backend's own `aud`. A valid, correctly-audienced token is sufficient proof of authorization — Access's policy (single email allow) already did the gating; no application-level allowlist check remains. The panel drops Firebase Auth entirely, including its one indirect dependency (`scheduled_events`/`devices` Firestore access), which moves behind two new Worker routes using the Worker's existing service-account Firestore helpers.

**Tech Stack:** TypeScript, Hono (Astroloji backend, Cloudflare Workers), `jose` (JWT verification), React 19 + Vite (panel), Cloudflare Access (Zero Trust), Firestore REST API (service-account auth, unchanged).

## Global Constraints

- Cloudflare Access team domain: `oaslananka.cloudflareaccess.com`. (Confirmed live via `GET /accounts/{id}/access/organizations`.)
- Three Access Applications already exist — do not recreate them, use these exact values:
  | Backend | Domain | `aud` |
  |---|---|---|
  | Panel | `admin.parsfilo.com` | `d0a9a93c048ff7508b045f6be3e7a3ce4f99d20c85ac69c0f8d4bfc6b745b59d` |
  | Worker admin routes | `admin-api.parsfilo.com` | `5069a4e84e68eb9898e8831ce46e9d93a5c26a3892f19bde0f37e57a94948287` |
  | Astroloji admin/panel routes | `astrology.parsfilo.com/api/v1/admin/panel/*` | `8012ac7ff763102597117ab4beeb813c367d415b71b2d8f3f18406b46c5c0586` |
- Cloudflare Access JWKS endpoint: `https://oaslananka.cloudflareaccess.com/cdn-cgi/access/certs`, returns a standard JWK Set (`{ keys: [{ kid, kty: "RSA", alg: "RS256", e, n }], ... }`) — confirmed live. Verify with `jose`'s `importJWK`, not `importX509` (that's the Firebase-only path and must not change).
- Access-protected requests carry the verified identity in a `Cf-Access-Jwt-Assertion` request header, injected by Cloudflare's edge — never trust any other header for this purpose, and never verify a token without checking `aud` matches the specific backend's own Application (a token minted for one Application must not authorize a different one).
- The public, non-admin Worker routes (`registerDevice`, `verifyPurchase`, `health` on the original `contentapp-admin-api.oaslananka.workers.dev` domain) are explicitly out of scope — do not add Access verification to them, do not change their existing behavior.
- The existing `astrology.parsfilo.com` end-user routes (everything outside `/api/v1/admin/panel/*`) are out of scope — already unaffected, confirmed live (`/api/v1/health` still returns 200 unauthenticated).
- No Firebase Auth code, Firebase ID token verification, or Firestore-`admins`-collection authorization logic may remain reachable anywhere in the three codebases when this plan is done — dead code is deleted, not left in place (per the approved design's "tamamen kaldır" decision).
- Doppler config for Astroloji secrets: project `mobil-apps`, config `astrology`. Doppler config for the framework repo: project `android-multi-app-framework`, config `prod`.

---

## Part A — Astroloji backend (`backend/`)

### Task A1: Cloudflare Access JWT verification core

**Files:**
- Create: `backend/src/utils/cloudflareAccess.ts`
- Test: `backend/tests/utils/cloudflareAccess.test.ts`

**Interfaces:**
- Produces: `verifyCloudflareAccessJwt(env: Pick<Env, 'CACHE'>, token: string, teamDomain: string, expectedAud: string): Promise<{ email: string }>` — exported from `@/utils/cloudflareAccess`. Throws on any verification failure (bad signature, wrong issuer, wrong audience, missing/invalid email claim). Task A2 imports this.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/utils/cloudflareAccess.test.ts`:

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
    importJWK: vi.fn().mockResolvedValue('fake-crypto-key')
  };
});

import { verifyCloudflareAccessJwt } from '@/utils/cloudflareAccess';
import { createTestEnv } from '../helpers/env';

function fakeToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString('base64url');
  return `${header}.payload.signature`;
}

function mockJwksResponse() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ keys: [{ kid: 'test-kid', kty: 'RSA', alg: 'RS256', e: 'AQAB', n: 'fake-n' }] })
  );
}

describe('verifyCloudflareAccessJwt', () => {
  it('verifies signature, issuer, and the given audience, then returns the email claim', async () => {
    const env = createTestEnv();
    mockJwksResponse();
    jwtVerifyMock.mockResolvedValue({ payload: { email: 'oaslananka@gmail.com' } });

    const identity = await verifyCloudflareAccessJwt(
      env,
      fakeToken(),
      'oaslananka.cloudflareaccess.com',
      'test-aud-123'
    );

    expect(identity).toEqual({ email: 'oaslananka@gmail.com' });
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      'fake-crypto-key',
      expect.objectContaining({
        algorithms: ['RS256'],
        issuer: 'https://oaslananka.cloudflareaccess.com',
        audience: 'test-aud-123'
      })
    );
  });

  it('throws when the token has no email claim', async () => {
    const env = createTestEnv();
    mockJwksResponse();
    jwtVerifyMock.mockResolvedValue({ payload: {} });

    await expect(
      verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123')
    ).rejects.toThrow('Cloudflare Access token is missing an email claim.');
  });

  it('propagates signature/issuer/audience verification failures', async () => {
    const env = createTestEnv();
    mockJwksResponse();
    jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

    await expect(
      verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123')
    ).rejects.toThrow();
  });

  it('caches the JWKS in KV and does not re-fetch on a subsequent call with a cached kid', async () => {
    const env = createTestEnv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ keys: [{ kid: 'test-kid', kty: 'RSA', alg: 'RS256', e: 'AQAB', n: 'fake-n' }] })
    );
    jwtVerifyMock.mockResolvedValue({ payload: { email: 'oaslananka@gmail.com' } });

    await verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123');
    await verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run tests/utils/cloudflareAccess.test.ts`
Expected: FAIL — `@/utils/cloudflareAccess` does not exist.

- [ ] **Step 3: Implement**

Create `backend/src/utils/cloudflareAccess.ts`:

```ts
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

interface CloudflareAccessJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface CloudflareAccessJwksResponse {
  keys: CloudflareAccessJwk[];
}

function jwksCacheKey(teamDomain: string): string {
  return `cloudflare_access_jwks_${teamDomain}`;
}

const ACCESS_JWKS_CACHE_TTL_SECONDS = 3600; // 1 hour

async function fetchAccessJwks(teamDomain: string): Promise<CloudflareAccessJwksResponse> {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error('Unable to fetch Cloudflare Access verification certificates.');
  }
  return (await response.json()) as CloudflareAccessJwksResponse;
}

async function resolveAccessVerificationKey(
  env: { CACHE: KVNamespace },
  teamDomain: string,
  token: string
): Promise<CryptoKey> {
  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new Error('Cloudflare Access token is missing a kid header.');
  }

  const cacheKey = jwksCacheKey(teamDomain);
  const cached = await env.CACHE.get(cacheKey);
  let jwks: CloudflareAccessJwksResponse;

  if (cached) {
    jwks = JSON.parse(cached) as CloudflareAccessJwksResponse;
  } else {
    jwks = await fetchAccessJwks(teamDomain);
    await env.CACHE.put(cacheKey, JSON.stringify(jwks), { expirationTtl: ACCESS_JWKS_CACHE_TTL_SECONDS });
  }

  let jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // kid not found in cache — force refresh once
    jwks = await fetchAccessJwks(teamDomain);
    await env.CACHE.put(cacheKey, JSON.stringify(jwks), { expirationTtl: ACCESS_JWKS_CACHE_TTL_SECONDS });
    jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (!jwk) {
      throw new Error('Unable to resolve Cloudflare Access verification key.');
    }
  }

  return importJWK({ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' }, 'RS256') as Promise<CryptoKey>;
}

/**
 * Verifies a Cloudflare Access JWT (the `Cf-Access-Jwt-Assertion` header
 * value Cloudflare's edge injects after a successful Access login) against
 * one specific Access Application's audience. A token that verifies is
 * sufficient proof of authorization — Access's own policy already gated the
 * login; callers should not layer an additional allowlist check on top.
 */
export async function verifyCloudflareAccessJwt(
  env: { CACHE: KVNamespace },
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<{ email: string }> {
  const key = await resolveAccessVerificationKey(env, teamDomain, token);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    issuer: `https://${teamDomain}`,
    audience: expectedAud
  });

  const email = payload.email;
  if (typeof email !== 'string' || !email) {
    throw new Error('Cloudflare Access token is missing an email claim.');
  }

  return { email };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run tests/utils/cloudflareAccess.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/utils/cloudflareAccess.ts tests/utils/cloudflareAccess.test.ts
git commit -m "feat(admin-panel): add Cloudflare Access JWT verification core"
```

---

### Task A2: Rewire `requireAdminPanelAuth` to Cloudflare Access, delete the Firebase-based path

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/utils/jwt.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/tests/helpers/env.ts`
- Create: `backend/tests/utils/firebaseIdToken.test.ts` (relocated `verifyFirebaseIdToken` regression coverage — see Step 1)
- Delete: `backend/tests/utils/jwtAdminPanel.test.ts` (superseded by Task A1's test file for the new mechanism plus this task's `firebaseIdToken.test.ts` — see Step 1)
- Test: `backend/tests/middleware/adminPanelAuth.test.ts` (rewritten in place)

**Interfaces:**
- Consumes: `verifyCloudflareAccessJwt` from Task A1.
- Produces: `requireAdminPanelAuth(operation: AdminOperation): AppMiddleware` — unchanged export name/signature, so `backend/src/workers/adminPanel.ts` (Tasks A3/A4 in the earlier admin-panel-integration plan, already merged) needs no changes.

- [ ] **Step 1: Move the `verifyFirebaseIdToken` regression test into its own file, then delete the admin-panel-specific Firebase test file**

`backend/tests/utils/jwtAdminPanel.test.ts` has two `describe` blocks: `verifyAdminPanelIdentity` (all about to be deleted) and `verifyFirebaseIdToken (regression)` (must survive with its real assertions intact — `verifyFirebaseIdToken` itself is untouched by this migration, still used by `backend/src/workers/user.ts` for end-user sign-in, and this file-scoped `vi.mock('jose', ...)` is the only direct unit test of its real crypto-verification path; `tests/workers/user.test.ts` only exercises it through a module-level mock, not the real JWKS/signature logic). Do not fold it into `jwt.test.ts` — that file tests `signAppJwt`/`verifyAppJwt`/`createGoogleAccessToken` against the *real* `jose` module, and `vi.mock` is hoisted file-wide, so adding a jose mock there would break those tests. Instead, create a new file that keeps the exact same mocking setup `jwtAdminPanel.test.ts` already uses, containing only the surviving `describe` block:

Create `backend/tests/utils/firebaseIdToken.test.ts`:

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

import { verifyFirebaseIdToken } from '@/utils/jwt';
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

describe('verifyFirebaseIdToken', () => {
  it('verifies against the app\'s own FIREBASE_SERVICE_ACCOUNT_JSON project, unchanged', async () => {
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

This is the exact same test `jwtAdminPanel.test.ts` already had — copied verbatim, not weakened, just relocated to a file name that reflects it now covers only `verifyFirebaseIdToken`.

Then delete `backend/tests/utils/jwtAdminPanel.test.ts` entirely:

```bash
git rm backend/tests/utils/jwtAdminPanel.test.ts
```

- [ ] **Step 2: Remove `verifyAdminPanelIdentity` and its supporting type from `jwt.ts`**

In `backend/src/utils/jwt.ts`, delete the `VerifiedFirebaseToken` interface's `email`/`emailVerified` fields are still needed by nothing else — check first: `grep -n "VerifiedFirebaseToken\|verifyFirebaseIdTokenForProject" backend/src/utils/jwt.ts` to confirm `verifyFirebaseIdTokenForProject` has no other caller after removing `verifyAdminPanelIdentity`. It does not (its only two callers are `verifyFirebaseIdToken` and `verifyAdminPanelIdentity`). Simplify `VerifiedFirebaseToken` back to only the fields `verifyFirebaseIdToken` actually returns, and delete the `verifyAdminPanelIdentity` export entirely:

Replace:
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
```
with:
```ts
interface VerifiedFirebaseToken {
  aud: string;
  iss: string;
  sub: string;
  user_id?: string;
  firebase?: { sign_in_provider?: string };
}
```

Inside `verifyFirebaseIdTokenForProject`'s return object, delete the two now-unused-here lines:
```ts
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    emailVerified: payload['email_verified'] === true,
```

Delete this entire block (the export and its doc comment):
```ts
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

- [ ] **Step 3: Update `types.ts` — drop the two Firebase-panel config values, add the Access config**

In `backend/src/types.ts`, remove `ADMIN_PANEL_ALLOWED_EMAILS` from `SecretBindings` (delete the field and its doc comment) and remove `ADMIN_PANEL_FIREBASE_PROJECT_ID` from `RuntimeConfigBindings` (delete the field and its doc comment). Add two new `RuntimeConfigBindings` fields (neither is a secret — a team domain and an `aud` tag are not sensitive on their own; a valid Access-signed JWT is still required):

```ts
interface RuntimeConfigBindings {
  PLAY_RTDN_AUDIENCE: string;
  PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: string;
  /** Cloudflare Access team domain, e.g. "oaslananka.cloudflareaccess.com". */
  ADMIN_PANEL_ACCESS_TEAM_DOMAIN: string;
  /** This Access Application's aud tag — scopes verification to astrology.parsfilo.com/api/v1/admin/panel/* specifically. */
  ADMIN_PANEL_ACCESS_AUD: string;
}
```

- [ ] **Step 4: Rewrite `requireAdminPanelAuth` in `middleware/auth.ts`**

Change the import line:
```ts
import { verifyAdminPanelIdentity, verifyAppJwt } from '@/utils/jwt';
```
to:
```ts
import { verifyAppJwt } from '@/utils/jwt';
import { verifyCloudflareAccessJwt } from '@/utils/cloudflareAccess';
```

Replace the entire block from `function resolveAdminPanelAllowedEmails` through the end of `runAdminPanelAuth` (i.e. everything between `requireAdminCapability`'s closing brace and `export function requireAdminPanelAuth`) with:

```ts
async function runAdminPanelAuth(c: AppContext, next: Next, operation: AdminOperation): Promise<Response | void> {
  const audit = (outcome: 'authorized' | 'rejected' | 'completed' | 'failed') =>
    logAdminOperation({ requestId: c.get('requestId'), capability: 'admin-panel', operation, outcome });

  const token = c.req.header('cf-access-jwt-assertion');
  if (!token) {
    audit('rejected');
    return jsonError(c, 401, 'UNAUTHORIZED', 'Missing Cloudflare Access token.');
  }

  try {
    await verifyCloudflareAccessJwt(c.env, token, c.env.ADMIN_PANEL_ACCESS_TEAM_DOMAIN, c.env.ADMIN_PANEL_ACCESS_AUD);
  } catch {
    audit('rejected');
    return jsonError(c, 401, 'INVALID_TOKEN', 'Cloudflare Access token is invalid or expired.');
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
```

(`getBearerToken` stays — `requireAdminCapability`/`requirePlayWebhookAuth` still use it; only `runAdminPanelAuth` stops using it, since Cloudflare Access delivers its token via a dedicated header, not `Authorization: Bearer`.)

- [ ] **Step 5: Rewrite the middleware test**

Replace `backend/tests/middleware/adminPanelAuth.test.ts` in full:

```ts
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { verifyCloudflareAccessJwtMock } = vi.hoisted(() => ({
  verifyCloudflareAccessJwtMock: vi.fn()
}));

vi.mock('@/utils/cloudflareAccess', async () => {
  const actual = await vi.importActual<typeof import('@/utils/cloudflareAccess')>('@/utils/cloudflareAccess');
  return {
    ...actual,
    verifyCloudflareAccessJwt: verifyCloudflareAccessJwtMock
  };
});

import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings } from '@/types';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv();
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
  verifyCloudflareAccessJwtMock.mockReset();
});

describe('requireAdminPanelAuth', () => {
  it('authorizes a valid Cloudflare Access token and emits sanitized audit events', async () => {
    verifyCloudflareAccessJwtMock.mockResolvedValue({ email: 'oaslananka@gmail.com' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp().request(
      '/protected',
      { headers: { 'cf-access-jwt-assertion': 'test-token' } },
      env()
    );

    expect(response.status).toBe(200);
    const events = adminEvents(log);
    expect(events.map((event) => event.outcome)).toEqual(['authorized', 'completed']);
    expect(events.every((event) => event.capability === 'admin-panel' && event.operation === 'panel.health')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('oaslananka@gmail.com');
    expect(JSON.stringify(events)).not.toContain('test-token');
  });

  it('rejects with 401 when the Cf-Access-Jwt-Assertion header is missing', async () => {
    const response = await protectedApp().request('/protected', {}, env());
    expect(response.status).toBe(401);
    expect(verifyCloudflareAccessJwtMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token verification fails (bad signature, wrong aud, expired)', async () => {
    verifyCloudflareAccessJwtMock.mockRejectedValue(new Error('signature verification failed'));
    const response = await protectedApp().request(
      '/protected',
      { headers: { 'cf-access-jwt-assertion': 'bad-token' } },
      env()
    );
    expect(response.status).toBe(401);
  });

  it('passes this backend\'s team domain and aud to the verifier', async () => {
    verifyCloudflareAccessJwtMock.mockResolvedValue({ email: 'oaslananka@gmail.com' });
    const testEnv = createTestEnv({
      ADMIN_PANEL_ACCESS_TEAM_DOMAIN: 'oaslananka.cloudflareaccess.com',
      ADMIN_PANEL_ACCESS_AUD: 'astroloji-specific-aud'
    });

    await protectedApp().request('/protected', { headers: { 'cf-access-jwt-assertion': 'test-token' } }, testEnv);

    expect(verifyCloudflareAccessJwtMock).toHaveBeenCalledWith(
      expect.anything(),
      'test-token',
      'oaslananka.cloudflareaccess.com',
      'astroloji-specific-aud'
    );
  });

  it('classifies downstream failures as failed, never completed', async () => {
    verifyCloudflareAccessJwtMock.mockResolvedValue({ email: 'oaslananka@gmail.com' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp(500).request(
      '/protected',
      { headers: { 'cf-access-jwt-assertion': 'test-token' } },
      env()
    );

    expect(response.status).toBe(500);
    expect(adminEvents(log).map((event) => event.outcome)).toEqual(['authorized', 'failed']);
  });
});
```

- [ ] **Step 6: Update `tests/helpers/env.ts`**

Replace:
```ts
    ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com',
    ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-demo-project',
```
with:
```ts
    ADMIN_PANEL_ACCESS_TEAM_DOMAIN: 'oaslananka.cloudflareaccess.com',
    ADMIN_PANEL_ACCESS_AUD: 'test-aud-astroloji',
```

- [ ] **Step 7: Run the affected tests, then the full suite**

Run: `cd backend && npx vitest run tests/middleware/adminPanelAuth.test.ts tests/utils/firebaseIdToken.test.ts tests/utils/cloudflareAccess.test.ts`
Expected: PASS

Run: `cd backend && npm test && npm run build`
Expected: PASS — this also confirms no other file still references `verifyAdminPanelIdentity`, `ADMIN_PANEL_ALLOWED_EMAILS`, or `ADMIN_PANEL_FIREBASE_PROJECT_ID` (a stale reference would be a TypeScript error here).

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/middleware/auth.ts src/utils/jwt.ts src/types.ts tests/helpers/env.ts tests/middleware/adminPanelAuth.test.ts tests/utils/firebaseIdToken.test.ts
git rm tests/utils/jwtAdminPanel.test.ts
git commit -m "feat(admin-panel): migrate requireAdminPanelAuth to Cloudflare Access"
```

---

### Task A3: Deployment plumbing — replace the two Firebase-panel config values

**Files:**
- Modify: `backend/scripts/shared.ts`
- Modify: `backend/scripts/deploy-worker.ts`
- Modify: `backend/tests/scripts/deployWorker.test.ts` (the `describe('buildWorkerDeployArgs admin panel variable', ...)` block added in the previous plan)
- Modify: `.github/workflows/backend-production-deploy.yml`
- Modify: `scripts/backend-production-deploy-workflow.test.mjs` (repo root)

**Interfaces:**
- Produces: `ADMIN_PANEL_ACCESS_TEAM_DOMAIN` and `ADMIN_PANEL_ACCESS_AUD` flow through the existing GitHub-Actions-repo-variable → `wrangler deploy --var` pipeline, replacing `ADMIN_PANEL_FIREBASE_PROJECT_ID`'s old slot. `ADMIN_PANEL_ALLOWED_EMAILS` is removed from the Doppler-secret-sync pipeline entirely (no replacement secret — Access needs none).

- [ ] **Step 1: Remove `ADMIN_PANEL_ALLOWED_EMAILS` from the Doppler-synced secret list**

In `backend/scripts/shared.ts`, remove the line `'ADMIN_PANEL_ALLOWED_EMAILS',` from `CLOUDFLARE_SECRET_NAMES`.

- [ ] **Step 2: Replace the runtime var in `deploy-worker.ts`**

In `backend/scripts/deploy-worker.ts`, change:
```ts
const ADMIN_PANEL_RUNTIME_VARIABLES = ['ADMIN_PANEL_FIREBASE_PROJECT_ID'] as const;
```
to:
```ts
const ADMIN_PANEL_RUNTIME_VARIABLES = ['ADMIN_PANEL_ACCESS_TEAM_DOMAIN', 'ADMIN_PANEL_ACCESS_AUD'] as const;
```

Change the return block:
```ts
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
```
to:
```ts
  return [
    'wrangler',
    'deploy',
    '--var',
    `PLAY_RTDN_AUDIENCE:${environment.PLAY_RTDN_AUDIENCE}`,
    '--var',
    `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`,
    '--var',
    `ADMIN_PANEL_ACCESS_TEAM_DOMAIN:${environment.ADMIN_PANEL_ACCESS_TEAM_DOMAIN}`,
    '--var',
    `ADMIN_PANEL_ACCESS_AUD:${environment.ADMIN_PANEL_ACCESS_AUD}`
  ];
```

- [ ] **Step 3: Update the deploy-worker test**

In `backend/tests/scripts/deployWorker.test.ts`, replace the `describe('buildWorkerDeployArgs admin panel variable', ...)` block in full:

```ts
describe('buildWorkerDeployArgs admin panel variables', () => {
  function baseEnv(): NodeJS.ProcessEnv {
    return {
      PLAY_RTDN_AUDIENCE: 'https://example.test/api/v1/webhooks/play-rtdn',
      PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: 'play-rtdn-push@example-project.iam.gserviceaccount.com',
      ADMIN_PANEL_ACCESS_TEAM_DOMAIN: 'oaslananka.cloudflareaccess.com',
      ADMIN_PANEL_ACCESS_AUD: 'test-astroloji-aud'
    };
  }

  it('passes the Cloudflare Access team domain and aud as deploy-time vars', () => {
    const args = buildWorkerDeployArgs(baseEnv());
    expect(args).toContain('ADMIN_PANEL_ACCESS_TEAM_DOMAIN:oaslananka.cloudflareaccess.com');
    expect(args).toContain('ADMIN_PANEL_ACCESS_AUD:test-astroloji-aud');
  });

  it('throws when ADMIN_PANEL_ACCESS_TEAM_DOMAIN is missing', () => {
    const env = baseEnv();
    delete env.ADMIN_PANEL_ACCESS_TEAM_DOMAIN;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/ADMIN_PANEL_ACCESS_TEAM_DOMAIN/);
  });

  it('throws when ADMIN_PANEL_ACCESS_AUD is missing', () => {
    const env = baseEnv();
    delete env.ADMIN_PANEL_ACCESS_AUD;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/ADMIN_PANEL_ACCESS_AUD/);
  });

  it('still requires the pre-existing RTDN variables', () => {
    const env = baseEnv();
    delete env.PLAY_RTDN_AUDIENCE;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/PLAY_RTDN_AUDIENCE/);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run tests/scripts/deployWorker.test.ts`
Expected: PASS

- [ ] **Step 5: Update the production-deploy workflow**

In `.github/workflows/backend-production-deploy.yml`, change:
```yaml
      ADMIN_PANEL_FIREBASE_PROJECT_ID: ${{ vars.ADMIN_PANEL_FIREBASE_PROJECT_ID }}
```
to:
```yaml
      ADMIN_PANEL_ACCESS_TEAM_DOMAIN: ${{ vars.ADMIN_PANEL_ACCESS_TEAM_DOMAIN }}
      ADMIN_PANEL_ACCESS_AUD: ${{ vars.ADMIN_PANEL_ACCESS_AUD }}
```

and change:
```yaml
          for name in DOPPLER_TOKEN DOPPLER_PROJECT DOPPLER_CONFIG CLOUDFLARE_ACCOUNT_ID PLAY_RTDN_AUDIENCE PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ADMIN_PANEL_FIREBASE_PROJECT_ID; do
```
to:
```yaml
          for name in DOPPLER_TOKEN DOPPLER_PROJECT DOPPLER_CONFIG CLOUDFLARE_ACCOUNT_ID PLAY_RTDN_AUDIENCE PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ADMIN_PANEL_ACCESS_TEAM_DOMAIN ADMIN_PANEL_ACCESS_AUD; do
```

- [ ] **Step 6: Update the workflow assertion test**

In `scripts/backend-production-deploy-workflow.test.mjs` (repo root), replace the test added by the previous plan:
```js
test('backend production deploy passes the admin panel Firebase project id to the Worker deploy step', () => {
  assert.match(workflow, /ADMIN_PANEL_FIREBASE_PROJECT_ID: \$\{\{ vars\.ADMIN_PANEL_FIREBASE_PROJECT_ID \}\}/);
  assert.match(workflow, /PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ADMIN_PANEL_FIREBASE_PROJECT_ID/);
});
```
with:
```js
test('backend production deploy passes the Cloudflare Access team domain and aud to the Worker deploy step', () => {
  assert.match(workflow, /ADMIN_PANEL_ACCESS_TEAM_DOMAIN: \$\{\{ vars\.ADMIN_PANEL_ACCESS_TEAM_DOMAIN \}\}/);
  assert.match(workflow, /ADMIN_PANEL_ACCESS_AUD: \$\{\{ vars\.ADMIN_PANEL_ACCESS_AUD \}\}/);
  assert.match(workflow, /PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ADMIN_PANEL_ACCESS_TEAM_DOMAIN ADMIN_PANEL_ACCESS_AUD/);
});
```

- [ ] **Step 7: Run the workflow assertion tests**

Run: `cd /home/msi/Desktop/MOBILE_PROJECTS/Astroloji && node --test scripts/*.test.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd /home/msi/Desktop/MOBILE_PROJECTS/Astroloji
git add backend/scripts/shared.ts backend/scripts/deploy-worker.ts backend/tests/scripts/deployWorker.test.ts .github/workflows/backend-production-deploy.yml scripts/backend-production-deploy-workflow.test.mjs
git commit -m "feat(admin-panel): wire ADMIN_PANEL_ACCESS_TEAM_DOMAIN/AUD through deployment"
```

- [ ] **Step 9 (manual, operator-only — not code): provision the real values and remove the old ones**

```bash
gh variable set ADMIN_PANEL_ACCESS_TEAM_DOMAIN --repo MakerParsDev/Astroloji --body "oaslananka.cloudflareaccess.com"
gh variable set ADMIN_PANEL_ACCESS_AUD --repo MakerParsDev/Astroloji --body "8012ac7ff763102597117ab4beeb813c367d415b71b2d8f3f18406b46c5c0586"
gh variable delete ADMIN_PANEL_FIREBASE_PROJECT_ID --repo MakerParsDev/Astroloji
doppler secrets delete ADMIN_PANEL_ALLOWED_EMAILS --project mobil-apps --config astrology --yes
```

Do this before the next `backend-production-deploy` run — Task A3's code changes make the old GitHub variable irrelevant and the new ones required, but nothing enforces the *delete* except this manual step; leaving `ADMIN_PANEL_FIREBASE_PROJECT_ID` set is harmless (unread), leaving `ADMIN_PANEL_ALLOWED_EMAILS` in Doppler is harmless too (no longer in `CLOUDFLARE_SECRET_NAMES`, so never synced) — both are just tidiness, not correctness, and can be done any time relative to the deploy.

---

## Part B — `contentapp-admin-api` Worker (`side-projects/cloudflare/workers/admin-api/`, in the `android-multi-app-framework` repo)

### Task B1: Cloudflare Access verification + rewire all 8 admin route call sites, delete Firebase-based auth

**Files:**
- Modify: `side-projects/cloudflare/workers/admin-api/src/index.ts`
- Modify: `side-projects/cloudflare/workers/admin-api/wrangler.toml`
- Test: whatever test file(s) already cover `handleAdminAccessCheck`/`ensureAdminAccess` in this project — locate with `grep -rl "ensureAdminAccess\|handleAdminAccessCheck" side-projects/cloudflare/workers/admin-api/test*` before writing new tests, and follow that file's existing mocking conventions rather than introducing a new pattern.

**Interfaces:**
- Produces: `verifyAccessRequest(request: Request, env: Env): Promise<{ email: string } | null>` — replaces `ensureAdminAccess`. Task B2 (new Firestore-proxy routes) uses the same function.

- [ ] **Step 0: Add `Access-Control-Allow-Credentials` to this Worker's CORS response**

`https://admin.parsfilo.com` is already in this Worker's `ALLOWED_ADMIN_ORIGINS` (confirmed live in Doppler, project `android-multi-app-framework`/`prod`) — no origin-list change needed. But `withCors` (near line 441) never sets `Access-Control-Allow-Credentials`, and the panel's fetch calls to this Worker will use `credentials: 'include'` after Task C1 (so the browser sends/receives the Cloudflare Access cookie cross-origin) — without this header the browser silently drops the response. Change:
```ts
function withCors(headers: Record<string, string>, origin: string | null, env: Env): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, env)) return headers;
  return {
    ...headers,
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}
```
to:
```ts
function withCors(headers: Record<string, string>, origin: string | null, env: Env): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, env)) return headers;
  return {
    ...headers,
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}
```
`isAllowedOrigin` already guarantees `origin` is never `*` at this point (it's the literal request `Origin` header, checked against `ALLOWED_ADMIN_ORIGINS`), so this pairing is spec-valid — a wildcard origin is never combined with `allow-credentials: true` here.

- [ ] **Step 1: Add the `ADMIN_ACCESS_TEAM_DOMAIN`/`ADMIN_ACCESS_AUD` env bindings**

In this Worker's `Env` interface (near the top of `src/index.ts`, alongside `FIREBASE_WEB_API_KEY` etc.), add:
```ts
ADMIN_ACCESS_TEAM_DOMAIN: string;
ADMIN_ACCESS_AUD: string;
```

- [ ] **Step 2: Add the Cloudflare Access JWT verifier**

This Worker doesn't share a module boundary with Astroloji's backend (separate repo, separate deploy) — the JWKS verification core is duplicated here, matching the same shape as `backend/src/utils/cloudflareAccess.ts` from Task A1, adapted to this file's existing style (no KV cache binding is assumed to exist in this Worker's `Env` — check `grep -n "KVNamespace\|CACHE" side-projects/cloudflare/workers/admin-api/src/index.ts` first; if there's no existing KV binding, skip the cache layer and fetch the JWKS on every call — this Worker's admin traffic volume is a single operator, not worth provisioning a new KV namespace for). Add near the other verification functions (after `verifyFirebaseIdToken`, before `parseAllowedEmails` — which this step also deletes):

```ts
interface CloudflareAccessJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

async function verifyAccessRequest(request: Request, env: Env): Promise<{ email: string } | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  const certsResponse = await fetch(`https://${env.ADMIN_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!certsResponse.ok) {
    throw new Error("Unable to fetch Cloudflare Access verification certificates.");
  }
  const { keys } = (await certsResponse.json()) as { keys: CloudflareAccessJwk[] };

  const [headerB64] = token.split(".");
  const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"))) as { kid?: string };
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error("Unable to resolve Cloudflare Access verification key.");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const [, payloadB64, signatureB64] = token.split(".");
  const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signedData);
  if (!valid) {
    throw new Error("Cloudflare Access token signature is invalid.");
  }

  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    email?: string;
  };

  if (payload.iss !== `https://${env.ADMIN_ACCESS_TEAM_DOMAIN}`) {
    throw new Error("Cloudflare Access token issuer mismatch.");
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.ADMIN_ACCESS_AUD)) {
    throw new Error("Cloudflare Access token audience mismatch.");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error("Cloudflare Access token is expired.");
  }
  if (typeof payload.email !== "string" || !payload.email) {
    throw new Error("Cloudflare Access token is missing an email claim.");
  }

  return { email: payload.email };
}
```

*(This Worker doesn't currently import `jose` — check `grep -n '"jose"' side-projects/cloudflare/workers/admin-api/package.json` first. If it's already a dependency, prefer rewriting this function using `jose`'s `importJWK`/`jwtVerify` to match Task A1's implementation exactly rather than the manual WebCrypto calls above — the manual version is provided as a dependency-free fallback in case `jose` isn't already present in this Worker's `package.json`, since adding a new dependency to a project this plan doesn't otherwise touch should be a deliberate choice, not an incidental one.)*

- [ ] **Step 3: Delete the Firebase-based admin auth code**

Delete these functions and the type they depend on (confirm each has no other caller first with `grep -n "<name>" side-projects/cloudflare/workers/admin-api/src/index.ts` — `verifyFirebaseIdToken`, `FirebaseLookupUser`, and `FIREBASE_LOOKUP_URL`/`env.FIREBASE_WEB_API_KEY` may be used elsewhere in this large file for non-admin purposes; only delete what's genuinely unreferenced after this change):

- `parseAllowedEmails` (function, ~line 521)
- `getFirestoreDoc`, `upsertFirestoreDoc`'s admin-doc-specific caller `upsertAdminDoc` (~lines 713, 778) — **keep** `upsertFirestoreDoc`, `deleteFirestoreDoc`, `listCollectionDocuments`, `runFirestoreQuery`, `firestoreDocumentUrl`, `parseFirestoreDocument`, `parseStringField`, `parseBooleanField`, `parseTimestampFieldMs`, `parseFirestoreValue`, `extractDocumentId` — Task B2 reuses these for the new `scheduled_events`/`devices` routes.
- `ensureAdminAccess` (~line 815)
- `handleAdminAccessCheck` (~line 842) and its route registration (`else if (path === "/adminAccessCheck") { ... }`, ~line 3969)
- `ResolvedAdmin` type (~line 89)
- `verifyFirebaseIdToken` and `FirebaseLookupUser` type — **only if** `grep` confirms no other caller remains after the above deletions.

- [ ] **Step 4: Rewire the 8 remaining `ensureAdminAccess` call sites**

Every one of these follows the identical shape (confirmed at lines ~985, 1159, 1804, 1976, 3131, 3301, 3819, 3859 — re-`grep -n "ensureAdminAccess"` after Step 3's deletions to get current line numbers, since deleting `handleAdminAccessCheck` shifts everything below it). For **each** occurrence, replace:

```ts
  let admin: ResolvedAdmin | null;
  try {
    admin = await ensureAdminAccess(request, env);
  } catch (error) {
    console.warn("[admin-api] <NAME> auth failed", error);
    return jsonResponse({ error: "Invalid Firebase Auth token" }, 401);
  }
  if (!admin) return jsonResponse({ error: "Missing Bearer token" }, 401);
  if (!admin.authorized) return jsonResponse({ error: "User is not in admins whitelist" }, 403);
```

with:

```ts
  let admin: { email: string } | null;
  try {
    admin = await verifyAccessRequest(request, env);
  } catch (error) {
    console.warn("[admin-api] <NAME> auth failed", error);
    return jsonResponse({ error: "Invalid Cloudflare Access token" }, 401);
  }
  if (!admin) return jsonResponse({ error: "Missing Cloudflare Access token" }, 401);
```

keeping each site's own `<NAME>` (`deviceCoverageReport`, `sendTestNotification`, `adminGetFlavorHubSummary`, `adminGetAnalyticsSummary`, `adminGetRevenueSummary`, `adPerformance`, `adminGetRemoteConfig`, `adminUpdateRemoteConfig`) exactly as it already reads at each site — this is a mechanical substitution, not a rewrite; do not change anything else in these 8 functions. Where a function body reads `admin.uid` afterward, change it to `admin.email` (Cloudflare Access has no separate uid concept for this single-operator use — check each of the 8 for a post-auth `admin.uid`/`admin.email` reference with `grep -n "admin\.\(uid\|email\)" side-projects/cloudflare/workers/admin-api/src/index.ts` and adjust any `admin.uid` reference to `admin.email`, since `uid` no longer exists on the narrowed type).

- [ ] **Step 5: Add the custom domain to `wrangler.toml`**

`admin-api.parsfilo.com` is already attached to this Worker via the Cloudflare API (done during planning) — confirm it's reflected in `wrangler.toml` too, so future `wrangler deploy` runs don't silently drop it. Add, if not already present:
```toml
[[routes]]
pattern = "admin-api.parsfilo.com/*"
custom_domain = true
```

- [ ] **Step 6: Locate and update existing tests**

Run `grep -rl "ensureAdminAccess\|handleAdminAccessCheck\|ResolvedAdmin" side-projects/cloudflare/workers/admin-api/test* side-projects/cloudflare/workers/admin-api/src/**/*.test.ts 2>/dev/null` to find every test file referencing the deleted symbols. For each, replace Firebase-ID-token-based mocking with a mock of `verifyAccessRequest` (module-level `vi.mock` or this project's equivalent — check `package.json`'s test runner first; it may be `vitest` like Astroloji's backend, or something else). Assert: missing `Cf-Access-Jwt-Assertion` header → 401; a rejected verification → 401; a resolved `{ email }` → 200 and downstream logic runs. Mirror Task A2 Step 5's test shape for the assertions, adapted to this project's existing test file structure — do not introduce a new testing convention into this file if one is already established.

- [ ] **Step 7: Run this project's full test suite and build**

Run whatever this project's `package.json` defines (check first — likely `npm test` and `npm run build` or equivalent, run from `side-projects/cloudflare/workers/admin-api/`).
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd side-projects/cloudflare/workers/admin-api
git add src/index.ts wrangler.toml
git add -A  # picks up whichever test file(s) Step 6 touched
git commit -m "feat(admin-api): migrate admin routes to Cloudflare Access, add admin-api.parsfilo.com"
```

---

### Task B2: New Firestore-proxy routes for `scheduled_events` and device targeting preview

**Files:**
- Modify: `side-projects/cloudflare/workers/admin-api/src/index.ts`

**Interfaces:**
- Consumes: `verifyAccessRequest` (Task B1), `listCollectionDocuments`, `upsertFirestoreDoc`, `deleteFirestoreDoc`, `parseFirestoreDocument`, `extractDocumentId`, `queryDevicesByPackage` (all pre-existing, unchanged).
- Produces: four new routes the panel (Task C, `App.tsx`) calls instead of talking to Firestore directly: `POST /adminListScheduledEvents`, `POST /adminSaveScheduledEvent`, `POST /adminDeleteScheduledEvent`, `POST /adminPreviewTargetDevices`.

This task exists because `scheduled_events`/`devices` are the one place in this whole system the panel talks to Firestore directly via the client SDK, gated by Firestore Security Rules (`isAdmin()`, requiring a real Firebase Auth session) rather than through this Worker — confirmed by reading `side-projects/firebase/firestore.rules` and `App.tsx`'s `saveEvent`/`removeEvent`/`previewTargetDevices`/the `onSnapshot` listener. Removing Firebase Auth from the panel (Task C) breaks these unless they move behind this Worker first.

- [ ] **Step 1: `POST /adminListScheduledEvents`**

Add a new handler function, near `handleDeviceCoverageReport`:

```ts
async function handleAdminListScheduledEvents(request: Request, env: Env): Promise<Response> {
  let admin: { email: string } | null;
  try {
    admin = await verifyAccessRequest(request, env);
  } catch (error) {
    console.warn("[admin-api] adminListScheduledEvents auth failed", error);
    return jsonResponse({ error: "Invalid Cloudflare Access token" }, 401);
  }
  if (!admin) return jsonResponse({ error: "Missing Cloudflare Access token" }, 401);

  const docs = await listCollectionDocuments(env, "scheduled_events");
  const events = docs.map((doc) => ({
    id: extractDocumentId(doc),
    ...parseFirestoreDocument(doc),
  }));

  return jsonResponse({ events });
}
```

Register the route in the dispatch chain (near the other `admin*` routes, following this file's existing `else if (path === "/adminX") { response = await handleAdminX(request, env); }` pattern):
```ts
      } else if (path === "/adminListScheduledEvents") {
        response = await handleAdminListScheduledEvents(request, env);
```

- [ ] **Step 2: `POST /adminSaveScheduledEvent`**

The panel's existing `buildPayload` (in `helpers.ts`, unchanged by this plan) already shapes the event fields the same way regardless of create-vs-update; the only client-side difference was `addDoc` (auto-ID) vs `setDoc` with a known ID. Firestore's REST API accepts any caller-supplied document ID via `PATCH`, so generate one server-side on create instead of relying on Firestore's auto-ID endpoint — this reuses the existing `upsertFirestoreDoc` helper unchanged for both paths:

```ts
function toFirestoreFields(value: Record<string, unknown>): Record<string, FirestoreField> {
  const fields: Record<string, FirestoreField> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof raw === "string") {
      fields[key] = { stringValue: raw };
    } else if (typeof raw === "boolean") {
      fields[key] = { booleanValue: raw };
    } else if (typeof raw === "number") {
      fields[key] = { integerValue: String(raw) };
    } else if (raw instanceof Date) {
      fields[key] = { timestampValue: raw.toISOString() };
    } else if (Array.isArray(raw)) {
      fields[key] = { arrayValue: { values: raw.map((item) => toFirestoreFields({ v: item }).v) } };
    } else if (typeof raw === "object") {
      fields[key] = { mapValue: { fields: toFirestoreFields(raw as Record<string, unknown>) } };
    }
  }
  return fields;
}

async function handleAdminSaveScheduledEvent(request: Request, env: Env): Promise<Response> {
  let admin: { email: string } | null;
  try {
    admin = await verifyAccessRequest(request, env);
  } catch (error) {
    console.warn("[admin-api] adminSaveScheduledEvent auth failed", error);
    return jsonResponse({ error: "Invalid Cloudflare Access token" }, 401);
  }
  if (!admin) return jsonResponse({ error: "Missing Cloudflare Access token" }, 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { id, isCreate, ...eventFields } = body;
  if (typeof id !== "string" || !id) {
    return jsonResponse({ error: "id is required" }, 400);
  }

  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    ...eventFields,
    updatedAt: now,
    updatedBy: admin.email,
  };
  if (isCreate) {
    fields.createdAt = now;
    fields.createdBy = admin.email;
    fields.sentTimezones = [];
    fields.lastResetAt = null;
    fields.lastDispatchedAt = null;
  }

  const ok = await upsertFirestoreDoc(env, `scheduled_events/${encodeURIComponent(id)}`, toFirestoreFields(fields));
  if (!ok) {
    return jsonResponse({ error: "Failed to save event" }, 500);
  }
  return jsonResponse({ id });
}
```

Register:
```ts
      } else if (path === "/adminSaveScheduledEvent") {
        response = await handleAdminSaveScheduledEvent(request, env);
```

Check `upsertFirestoreDoc`'s exact return type first (`grep -n "async function upsertFirestoreDoc" -A 30 side-projects/cloudflare/workers/admin-api/src/index.ts`) — the code above assumes it returns `boolean`; if it instead returns `void` or throws on failure, adjust the `if (!ok)` check to a `try/catch` around the call instead, matching whatever that existing function actually does (it is not being modified by this task, only called).

- [ ] **Step 3: `POST /adminDeleteScheduledEvent`**

```ts
async function handleAdminDeleteScheduledEvent(request: Request, env: Env): Promise<Response> {
  let admin: { email: string } | null;
  try {
    admin = await verifyAccessRequest(request, env);
  } catch (error) {
    console.warn("[admin-api] adminDeleteScheduledEvent auth failed", error);
    return jsonResponse({ error: "Invalid Cloudflare Access token" }, 401);
  }
  if (!admin) return jsonResponse({ error: "Missing Cloudflare Access token" }, 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { id } = body;
  if (typeof id !== "string" || !id) {
    return jsonResponse({ error: "id is required" }, 400);
  }

  const ok = await deleteFirestoreDoc(env, `scheduled_events/${encodeURIComponent(id)}`);
  if (!ok) {
    return jsonResponse({ error: "Failed to delete event" }, 500);
  }
  return jsonResponse({ ok: true });
}
```

Register:
```ts
      } else if (path === "/adminDeleteScheduledEvent") {
        response = await handleAdminDeleteScheduledEvent(request, env);
```

- [ ] **Step 4: `POST /adminPreviewTargetDevices`**

Reuses the existing `queryDevicesByPackage` (unchanged) — it already returns `notificationsEnabled` per device, so this just filters and counts:

```ts
async function handleAdminPreviewTargetDevices(request: Request, env: Env): Promise<Response> {
  let admin: { email: string } | null;
  try {
    admin = await verifyAccessRequest(request, env);
  } catch (error) {
    console.warn("[admin-api] adminPreviewTargetDevices auth failed", error);
    return jsonResponse({ error: "Invalid Cloudflare Access token" }, 401);
  }
  if (!admin) return jsonResponse({ error: "Missing Cloudflare Access token" }, 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const packages = parsePackages(body.packages);

  const byPackage: Record<string, number> = {};
  let total = 0;
  for (const packageName of packages) {
    const devices = await queryDevicesByPackage(env, packageName);
    const count = devices.filter((device) => device.notificationsEnabled).length;
    byPackage[packageName] = count;
    total += count;
  }

  return jsonResponse({ total, byPackage });
}
```

Register:
```ts
      } else if (path === "/adminPreviewTargetDevices") {
        response = await handleAdminPreviewTargetDevices(request, env);
```

- [ ] **Step 5: Write tests for the four new routes**

Following this project's existing test conventions (established in Task B1 Step 6), add coverage for each new route: 401 without a valid Access token; a successful call returns the expected JSON shape; `adminSaveScheduledEvent`/`adminDeleteScheduledEvent` reject a request missing `id` with 400. Use a fake `verifyAccessRequest` resolving `{ email: 'oaslananka@gmail.com' }` and fake/spy the Firestore helper functions rather than hitting real Firestore.

- [ ] **Step 6: Run tests and build**

Run this project's test and build commands.
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd side-projects/cloudflare/workers/admin-api
git add src/index.ts
git add -A  # test file(s) from Step 5
git commit -m "feat(admin-api): add scheduled-events and device-preview routes for the panel"
```

---

### Task B3: Device-finder Worker routes (plan gap found during Task C1 review)

Found during Task C1's task review: `App.tsx`'s "Device finder" feature (`lookupDeviceByInstallationId`, `loadRecentDevices`) reads Firestore's `devices` collection directly via the client SDK, gated by a security rule requiring a real Firebase Auth session — a session Task C1 removes entirely. Task B2 only covered `scheduled_events` and the target-device-*count* preview, not device lookup/listing; this gap was missed in the original plan. Full task text: `.superpowers/sdd/2026-08-12-admin-panel-cloudflare-access-migration/task-B3-brief.md` (written after Task C1's review, following B2's exact pattern — `POST /adminLookupDevice` and `POST /adminListRecentDevices`, reusing `getFirestoreDoc`/`runFirestoreQuery`/`parseFirestoreDocument`/`extractDocumentId`). Task C1's fix-loop round then rewires the panel to call these instead of Firestore directly.

---

## Part C — `admin-notifications` panel (`side-projects/admin-notifications/`, same framework repo)

### Task C1: Remove Firebase Auth, wire everything through Cloudflare Access

**Files:**
- Modify: `src/firebase.ts`
- Delete: `src/components/AuthScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/helpers.ts`
- Modify: every component currently taking a `user: User` prop: `src/components/FlavorHubPanel.tsx`, `AnalyticsPanel.tsx`, `RevenuePanel.tsx`, `RemoteConfigPanel.tsx`, `TestPushPanel.tsx`, `AstrolojiPanel.tsx`
- Modify: `src/env.d.ts`
- Test: `test/helpers.test.ts` (only if it references anything removed here — check first)

**Interfaces:**
- Produces: no more `user: User` props anywhere in this project; `fetchAdminFunctionJson` drops its `idToken` parameter.

- [ ] **Step 1: Trim `firebase.ts`**

Keep `firestore` (still needed — Task B2's new routes replace *browser-side* Firestore access, but this file's `firestore` export itself is just the client handle; if nothing imports it after this task's other steps, a later cleanup pass can remove it, but do not remove it speculatively here) and `functionsBaseUrl` (still used for every `admin*` fetch call, now pointed at `admin-api.parsfilo.com` — see Step 3). Remove: `auth`, `authPersistenceReady`, `AuthPersistenceMode`, `getAuthPersistenceMode`, `googleProvider`, and the `firebase/auth` import block. After this edit, re-run `grep -rn "firebase/auth\|from \"./firebase\"" src/` to confirm no remaining import references a deleted export — fix any that do as part of this same task (they'll be in the files this task's other steps already touch).

- [ ] **Step 2: Delete `AuthScreen.tsx`**

```bash
git rm src/components/AuthScreen.tsx
```

- [ ] **Step 3: Rewrite `App.tsx`**

Remove: the `firebase/auth` imports, `getRedirectResult`/`onAuthStateChanged`/`signInWithEmailAndPassword`/`signInWithRedirect`/`signOut` usage, `FirebaseError` import (only if unused elsewhere in the file after this), `AdminState`/`adminState` state and its `useEffect` (the `/adminAccessCheck` call — Cloudflare Access already gated the page load, there is nothing left to check), `handleSignIn`, `handleSignOut`, `handleEmailPasswordSignIn`, the `AuthScreen` render branch, and the `user`/`setUser` state entirely (nothing downstream needs a Firebase `User` object anymore).

Rewrite the three Firestore-touching handlers to call the new Worker routes (Task B2) instead of the Firestore SDK directly:

```ts
  const loadEvents = useCallback(async () => {
    setEventsState("loading");
    try {
      const response = await fetch(`${functionsBaseUrl}/adminListScheduledEvents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as { events?: unknown[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      const parsed = (body.events ?? []).map((raw) =>
        parseEvent((raw as { id: string }).id, raw as DocumentData),
      );
      setEvents(parsed);
      setEventsState("ready");
    } catch (err) {
      console.error("Events load error:", err);
      setEventsState("error");
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);
```

(This replaces the `onSnapshot` real-time listener with a one-shot load — the panel loses live push updates for this one tab in exchange for not needing Firebase Auth; add a "Refresh" button to `EventListPanel`'s header calling `loadEvents`, matching the pattern already used in `SystemHealthPanel`/`AstrolojiPanel`.)

```ts
  const saveEvent = useCallback(async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = buildEventPayload(form, isCreateMode);
      const id = isCreateMode ? crypto.randomUUID() : selectedId!;
      const response = await fetch(`${functionsBaseUrl}/adminSaveScheduledEvent`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isCreate: isCreateMode, ...payload }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setSelectedId(id);
      setMessage(isCreateMode ? "Event created." : "Event saved.");
      await loadEvents();
    } catch (err) {
      console.error("Save event error:", err);
      setError(err instanceof Error ? err.message : "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }, [form, isCreateMode, selectedId, loadEvents]);

  const removeEvent = useCallback(async () => {
    if (!selectedId) return;
    const ok = window.confirm("Delete this event permanently?");
    if (!ok) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`${functionsBaseUrl}/adminDeleteScheduledEvent`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      resetForm();
      setMessage("Event deleted.");
      await loadEvents();
    } catch (err) {
      console.error("Delete event error:", err);
      setError(err instanceof Error ? err.message : "Failed to delete event.");
    } finally {
      setDeleting(false);
    }
  }, [selectedId, resetForm, loadEvents]);

  const previewTargetDevices = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewCount(null);
    setPreviewByPackage({});
    try {
      const packages = form.packages.includes("*") ? allPackages : form.packages;
      const response = await fetch(`${functionsBaseUrl}/adminPreviewTargetDevices`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages }),
      });
      const body = (await response.json()) as { total?: number; byPackage?: Record<string, number>; error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setPreviewCount(body.total ?? 0);
      setPreviewByPackage(body.byPackage ?? {});
    } catch (err) {
      console.error("Preview error:", err);
      setPreviewError(err instanceof Error ? err.message : "Failed to preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [form.packages]);
```

`helpers.ts`'s `buildPayload(form, user, isCreate)` took a Firebase `User` only for `user.uid` (used as `createdBy`/`updatedBy`) — Step 3's Worker route now stamps `createdBy`/`updatedBy` itself from the verified Access identity's email, so the panel no longer needs to send or compute either field. Rename `buildPayload` to `buildEventPayload` in `helpers.ts` and drop its `user` parameter (Step 6 covers `helpers.ts` directly):

```ts
export function buildEventPayload(form: ScheduledEventForm, isCreate: boolean) {
  const targetTimezones = parseTargetTimezonesInput(form.targetTimezonesInput);
  const base: Record<string, unknown> = {
    name: form.name.trim(),
    type: form.type.trim(),
    status: form.status,
    localDeliveryTime: form.localDeliveryTime.trim(),
    targetTimezones: targetTimezones.length > 0 ? targetTimezones : null,
    topic: form.topic.trim() || null,
    packages: normalizePackages(form.packages),
    title: { tr: form.title.tr.trim(), en: form.title.en.trim(), de: form.title.de.trim() },
    body: { tr: form.body.tr.trim(), en: form.body.en.trim(), de: form.body.de.trim() },
  };

  if (form.scheduleMode === "once") {
    base.date = form.date.trim();
    base.recurrence = null;
  } else if (form.scheduleMode === "daily") {
    base.date = null;
    base.recurrence = "daily";
  } else {
    base.date = null;
    base.recurrence = `weekly:${form.weeklyDay}`;
  }

  return base;
}
```

(`serverTimestamp()`/`updatedAt`/`updatedBy`/`createdAt`/`createdBy`/`sentTimezones`/`lastResetAt`/`lastDispatchedAt` are no longer set here — Task B2 Step 2's `handleAdminSaveScheduledEvent` sets all of them server-side.)

Remove the top-of-file Firestore imports (`addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where`) that are no longer used after this rewrite — re-check with `grep -n "firestore\." src/App.tsx` once the above changes are in place; the `devices` listing used elsewhere (`queryDevicesByPackage`'s panel-side caller, if any beyond the preview) should be checked the same way before deleting any Firestore import wholesale.

Finally, since there is no more `adminState`/`AuthScreen` gate, the top-level render logic simplifies to always rendering the dashboard shell — Cloudflare Access has already ensured only an authorized browser reaches this JS at all. Remove the `if (adminState === "checking") {...}` / `if (adminState === "unauthorized") {...}` render branches; the "authorized" branch's JSX becomes the only render path.

- [ ] **Step 4: Update `Header.tsx`**

Remove the `user: User` prop, the `user-pill` block that reads `user.email`, and `onSignOut`/the "Sign out" button — Cloudflare Access's own logout is reachable at `https://admin.parsfilo.com/cdn-cgi/access/logout`; add a plain link to it instead:

```tsx
type HeaderProps = {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
};

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <>
      <header className="topbar" role="banner">
        <div className="topbar-brand">
          <h1>
            <span className="brand-icon" aria-hidden="true">🔔</span>
            ContentApp Admin
          </h1>
          <p className="topbar-subtitle">
            Operate flavor inventory, notifications, remote config, analytics, revenue, and system health from one panel.
          </p>
          <p className="topbar-build">
            build <code>{appBuildId}</code> · {appBuildTime}
          </p>
        </div>
        <div className="topbar-actions">
          <a className="btn-secondary" href="https://admin.parsfilo.com/cdn-cgi/access/logout" aria-label="Sign out">
            Sign out
          </a>
        </div>
      </header>

      <nav className="admin-tabs" role="tablist" aria-label="Admin sections">
        {/* ...unchanged tab buttons... */}
      </nav>
    </>
  );
}
```

(Keep every existing `<button role="tab" ...>` block exactly as-is — only the header's user-pill/sign-out section and the props type change.)

- [ ] **Step 5: Update `fetchAdminFunctionJson`**

In `helpers.ts`, remove the `idToken` parameter and add `credentials: 'include'`:

```ts
export async function fetchAdminFunctionJson<T>(
  input: {
    endpoint: string;
    body?: Record<string, unknown>;
    method?: "GET" | "POST";
  },
): Promise<T> {
  const { endpoint, body, method = body ? "POST" : "GET" } = input;
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: {},
  };

  if (method !== "GET") {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body ?? {});
  }

  const response = await fetch(endpoint, init);
  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new Error(summarizeApiError(responseBody, `HTTP ${response.status}: Request failed`));
  }

  return responseBody as T;
}
```

- [ ] **Step 6: Update every panel component that took `user: User`**

For each of `FlavorHubPanel.tsx`, `AnalyticsPanel.tsx`, `RevenuePanel.tsx`, `RemoteConfigPanel.tsx`, `TestPushPanel.tsx`, `AstrolojiPanel.tsx`: remove the `user: User` prop from the component's props type, remove the `import type { User } from "firebase/auth";` line, remove `const idToken = await user.getIdToken();`, and remove `idToken,` from the `fetchAdminFunctionJson({...})` call. Remove `user` from every `useEffect`/`useCallback` dependency array it appeared in (replace `[user]` with `[]`, `[apiBaseUrl, user]` with `[apiBaseUrl]`, etc. — check each call site's exact array). `App.tsx`'s render calls (`<FlavorHubPanel user={user} />` etc.) lose the `user={user}` prop, matching Step 3's removal of the `user` variable itself.

`AstrolojiPanel.tsx` (added this session) follows the exact same mechanical transform as the other five — it is not a special case.

- [ ] **Step 7: Update `env.d.ts`**

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET` were only ever consumed by the now-deleted `auth`/`googleProvider` setup in `firebase.ts` — check `grep -n "VITE_FIREBASE_API_KEY\|VITE_FIREBASE_AUTH_DOMAIN\|VITE_FIREBASE_APP_ID\|VITE_FIREBASE_MESSAGING_SENDER_ID\|VITE_FIREBASE_STORAGE_BUCKET" src/*.ts src/*.tsx` after Step 1; `VITE_FIREBASE_PROJECT_ID` is still needed (Firestore client init still uses `firebaseConfig.projectId`). Remove only the confirmed-unused ones from `ImportMetaEnv` in `env.d.ts`.

- [ ] **Step 8: Run this project's lint, test, and build**

```bash
cd side-projects/admin-notifications
npm run lint
npm test
npm run build
```
Expected: all PASS. A lint failure here (unused imports, unused `AdminState`/`AdminTab`-adjacent types) is expected on the first pass — fix each one named by the linter rather than suppressing it.

- [ ] **Step 9: Commit**

```bash
cd side-projects/admin-notifications
git add -A
git commit -m "feat(admin-notifications): remove Firebase Auth, migrate to Cloudflare Access"
```

---

## Part D — Firebase Cloud Functions cleanup

### Task D1: Delete the dead `adminAccessCheck` Cloud Function

**Revised during execution:** the original brief assumed both `adminAccessCheck.ts` and `adminAuth.ts` were unreachable. Step 1's grep found `adminAuth.ts`'s `authenticateAdminRequest` is still imported by five other Cloud Functions (`adminRemoteConfig.ts`, `sendTestNotification.ts`, `adPerformanceReport.ts`, `deviceCoverageReport.ts`, `adminSummary.ts`) — all explicitly out of scope per this plan's design spec ("Any other exports in `side-projects/firebase/functions` beyond `adminAccessCheck.ts`/`adminAuth.ts`"). `authenticateAdminRequest` internally calls `resolveAdminAccess` (the other export in the same file), so `adminAuth.ts` cannot be partially gutted — it stays intact as a whole file. Only `adminAccessCheck.ts` (genuinely orphaned — nothing calls it, the panel's `/adminAccessCheck` request goes to the Worker, not Cloud Functions) is deleted.

**Files:**
- Delete: `side-projects/firebase/functions/src/adminAccessCheck.ts`
- Modify: `side-projects/firebase/functions/src/index.ts` (remove only the `adminAccessCheck` export line)

**Interfaces:**
- None — pure deletion of already-unreachable code.

- [ ] **Step 1: Confirm nothing else imports `adminAccessCheck`**

```bash
grep -rn "adminAccessCheck" side-projects/firebase/functions/src/ | grep -v "adminAccessCheck.ts:"
```
Expected: no output (only self-references inside the file being deleted, plus its one export line in `index.ts`, which Step 2 removes). If this finds any other caller, stop and report it — do not delete.

- [ ] **Step 2: Delete and update the export barrel**

```bash
cd side-projects/firebase/functions
git rm src/adminAccessCheck.ts
```

Remove only the `adminAccessCheck` export line from `src/index.ts` — leave every other export, including anything related to `adminAuth`, untouched.

- [ ] **Step 3: Build this project**

Run whatever this project's build/typecheck command is (check `package.json` — likely `npm run build` or `tsc`).
Expected: PASS — confirms no other file referenced the deleted export.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "chore(functions): delete dead adminAccessCheck Cloud Function"
```

---

## Part E — End-to-end verification (manual, not automated)

### Task E1: Live verification across all three domains

Not a code task — no commit. Perform after Parts A–D are deployed (Astroloji via its existing `backend-production-deploy` workflow; the Worker and panel via their existing manual deploy flow, e.g. `wrangler deploy` / `npm run deploy` from each project, matching how this session's earlier work was deployed).

- [ ] Sign out of any existing session, visit `https://admin.parsfilo.com` — confirm redirect to `https://oaslananka.cloudflareaccess.com/cdn-cgi/access/login/...`.
- [ ] Complete the Cloudflare email-OTP login as `oaslananka@gmail.com` — confirm the panel dashboard loads with no sign-in screen of its own.
- [ ] Check every tab loads its data: Flavor Hub, Events (list renders, "Refresh" works), Remote Config, Analytics, Revenue, System Health, Astroloji (health card populates, LLM test buttons work).
- [ ] Create, edit, and delete a test scheduled event; confirm each operation succeeds and the list reflects it after a refresh.
- [ ] Run "Preview target device count" on the event form; confirm it returns a number without error.
- [ ] `curl -o /dev/null -w '%{http_code}\n' https://astrology.parsfilo.com/api/v1/admin/panel/health` unauthenticated → expect a Cloudflare Access redirect (302), not the old `401`.
- [ ] `curl -o /dev/null -w '%{http_code}\n' https://astrology.parsfilo.com/api/v1/health` (public route) → expect `200`, confirming the path-scoped Access Application didn't leak onto public traffic.
- [ ] `curl -o /dev/null -w '%{http_code}\n' https://contentapp-admin-api.oaslananka.workers.dev/health` (public device-facing route, old domain) → expect unchanged behavior, confirming Access on the new `admin-api.parsfilo.com` domain didn't affect the original domain.
- [ ] Confirm `https://europe-west1-makerpars-oaslananka-mobil.cloudfunctions.net/adminAccessCheck` is no longer referenced from anywhere reachable (the panel never calls it — already true before this plan; Task D1 additionally deletes the code that used to serve it).

## Definition of done

All four commits-worth of code (Parts A–D) are merged/deployed. No file in any of the three codebases imports `firebase/auth`, calls `verifyFirebaseIdToken`/`ensureAdminAccess` for an *admin* route, or reads `ADMIN_PANEL_ALLOWED_EMAILS`/`ADMIN_PANEL_FIREBASE_PROJECT_ID`. Every admin route on all three backends verifies a Cloudflare Access JWT scoped to its own Application's `aud`. Task E1's manual checklist passes in full against production.
