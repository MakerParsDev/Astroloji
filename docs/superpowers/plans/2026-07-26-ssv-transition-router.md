# Rewarded SSV Transition Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a reversible Cloudflare transition Worker for `astrology.parsfilo.com/api/v1/rewards/*` that serves the secure challenge/SSV/claim flow while temporarily forwarding only exact legacy reward claims to the unchanged production backend.

**Architecture:** A focused transition entrypoint reuses the merged reward handlers for secure requests and adds a fail-closed legacy classifier. The Worker is deployed with minimum D1/KV/secrets, then attached to a path-specific Cloudflare Route; plain `fetch(request)` forwards approved legacy traffic to the existing Custom Domain Worker. Deployment automation applies the additive D1 migration, syncs only required secrets, records rollback evidence, provisions a short-lived AdMob verification challenge, and keeps the full backend untouched.

**Tech Stack:** TypeScript 5.9, Hono 4.12, Cloudflare Workers, D1, KV, Wrangler 4.112, Vitest 3.2, Node.js 24, GitHub Actions, Doppler.

## Global Constraints

- Route only `astrology.parsfilo.com/api/v1/rewards/*` through the transition Worker.
- Worker name is exactly `astrology-ssv-transition`.
- `workers_dev = false`; no public workers.dev URL.
- Bind only `DB`, `CACHE`, `JWT_SECRET`, `ADMOB_REWARDED_ID`, and `LEGACY_REWARD_FORWARD_UNTIL`.
- Do not bind R2, Firebase, Google Play, admin, notification, or cron resources.
- Forward only an exact two-key legacy JSON body: `reward_type` and `identifier`.
- Mixed payloads, extra keys, malformed JSON, invalid identifiers, unsupported methods, and unsupported paths fail locally.
- Secure `challenge_id` claims, `prepare`, and SSV callbacks are always handled locally.
- Legacy forwarding expires at the configured UTC timestamp and returns HTTP 410 with `LEGACY_REWARD_FLOW_EXPIRED` at or after the deadline.
- Forwarded requests preserve method, URL, authorization header, content type, and body bytes.
- `ENABLE_PRODUCTION_RELEASE` remains `false` throughout this plan.
- The existing `astrology-backend` Custom Domain Worker is not deployed or modified during transition rollout.
- Every production mutation must have a rollback command or route-removal action recorded before execution.

---

## File Structure

- Create `backend/src/transition/rewardTransition.ts`: pure request classification, deadline enforcement, local secure dispatch, and approved legacy forwarding.
- Create `backend/src/transition/index.ts`: focused Worker entrypoint and minimum environment contract.
- Create `backend/tests/transition/rewardTransition.test.ts`: unit contract for exact legacy matching, secure-local routing, deadline behavior, and byte-preserving forwarding.
- Create `backend/tests/runtime/transition-worker-runtime.test.ts`: Miniflare/Wrangler runtime smoke coverage for bindings and public SSV behavior.
- Create `backend/wrangler.transition.toml`: dedicated Worker name, entrypoint, minimum bindings, fail-closed deadline, and `workers_dev = false`; production route attachment remains workflow-only.
- Create `backend/scripts/sync-transition-secrets.ts`: sync only `JWT_SECRET` and `ADMOB_REWARDED_ID` to the transition Worker.
- Create `backend/scripts/create-admob-verification-challenge.ts`: insert and later inspect/delete a short-lived D1 verification challenge without printing full identifiers.
- Create `backend/tests/scripts/transitionShared.test.ts`: tests for transition secret selection and verification challenge SQL/format helpers.
- Create `scripts/check-ssv-transition-route.mjs`: live route-isolation and fail-closed smoke checks.
- Create `scripts/check-ssv-transition-route.test.mjs`: injected-fetcher tests for status, forwarding, timeout, and non-reward isolation.
- Create `.github/workflows/backend-ssv-transition-deploy.yml`: reviewed deployment path that migrates D1, syncs minimum secrets, deploys the Worker, attaches the route, smokes it, and records evidence.
- Create `.github/workflows/backend-ssv-transition-rollback.yml`: explicit route removal / Worker rollback workflow.
- Create `scripts/backend-ssv-transition-workflows.test.mjs`: regression tests for deploy/rollback ordering and safety gates.
- Modify `backend/package.json`: add transition build/test/deploy/provision scripts.
- Modify `backend/tsconfig.json`: include transition source/tests if required by the final directory layout.
- Modify `backend/src/types.ts`: add the minimum `TransitionEnv` shape without weakening `Env`.
- Modify `backend/scripts/shared.ts`: expose a transition-only secret resolver.
- Modify `backend/vitest.runtime.config.ts`: include the transition runtime suite.
- Modify `docs/PLAY_PRODUCTION_READINESS.md` and `RELEASE_RUNBOOK.md`: document transition deployment, AdMob verification values, evidence, expiration, and rollback.
- Modify `.github/workflows/ci.yml`: run transition script/workflow regression tests.

---

### Task 1: Fail-Closed Reward Request Classifier

**Files:**
- Create: `backend/src/transition/rewardTransition.ts`
- Create: `backend/tests/transition/rewardTransition.test.ts`
- Modify: `backend/src/utils/validators.ts`

**Interfaces:**
- Consumes: `validateRewardPrepareBody`, `validateRewardClaimBody`, existing reward identifier rules.
- Produces:
  - `classifyRewardRequest(request: Request, nowMs: number, legacyForwardUntil: string): Promise<RewardRequestDecision>`
  - `RewardRequestDecision = { kind: 'local' } | { kind: 'forward'; body: Uint8Array } | { kind: 'reject'; response: Response }`
  - `isExactLegacyRewardClaim(value: unknown): value is { reward_type: RewardType; identifier: string }`

- [ ] **Step 1: Write failing classifier tests**

Add tests with exact expectations:

```ts
it('forwards only an exact legacy claim before the deadline', async () => {
  const request = jsonRequest('/api/v1/rewards/claim', {
    reward_type: 'daily',
    identifier: '2026-07-26'
  });

  const decision = await classifyRewardRequest(
    request,
    Date.parse('2026-07-26T20:00:00Z'),
    '2026-08-09T00:00:00Z'
  );

  expect(decision.kind).toBe('forward');
  expect(new TextDecoder().decode(decision.kind === 'forward' ? decision.body : new Uint8Array()))
    .toBe('{"reward_type":"daily","identifier":"2026-07-26"}');
});

it.each([
  { reward_type: 'daily', identifier: '2026-07-26', extra: true },
  { reward_type: 'daily', identifier: '2026-07-26', challenge_id: crypto.randomUUID() },
  { reward_type: 'daily', identifier: 'bad-date' },
  { reward_type: 'unknown', identifier: '2026-07-26' }
])('rejects non-exact legacy payload %#', async (body) => {
  const decision = await classifyRewardRequest(
    jsonRequest('/api/v1/rewards/claim', body),
    Date.parse('2026-07-26T20:00:00Z'),
    '2026-08-09T00:00:00Z'
  );
  expect(decision.kind).toBe('reject');
});

it('handles challenge claims locally', async () => {
  const decision = await classifyRewardRequest(
    jsonRequest('/api/v1/rewards/claim', { challenge_id: crypto.randomUUID() }),
    Date.parse('2026-07-26T20:00:00Z'),
    '2026-08-09T00:00:00Z'
  );
  expect(decision).toEqual({ kind: 'local' });
});

it('expires legacy forwarding at the exact deadline', async () => {
  const decision = await classifyRewardRequest(
    jsonRequest('/api/v1/rewards/claim', {
      reward_type: 'weekly',
      identifier: '2026-W30'
    }),
    Date.parse('2026-08-09T00:00:00Z'),
    '2026-08-09T00:00:00Z'
  );
  expect(decision.kind).toBe('reject');
  const response = decision.kind === 'reject' ? decision.response : new Response();
  expect(response.status).toBe(410);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'LEGACY_REWARD_FLOW_EXPIRED' }
  });
});
```

- [ ] **Step 2: Run tests and verify red state**

Run:

```bash
cd backend
npm test -- --run tests/transition/rewardTransition.test.ts
```

Expected: FAIL because `@/transition/rewardTransition` does not exist.

- [ ] **Step 3: Implement exact key and identifier classification**

Implement with byte-preserving body access:

```ts
export async function classifyRewardRequest(
  request: Request,
  nowMs: number,
  legacyForwardUntil: string
): Promise<RewardRequestDecision> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/rewards/')) {
    return reject(404, 'NOT_FOUND', 'Route is not served by the transition Worker.');
  }
  if (url.pathname === '/api/v1/rewards/prepare' && request.method === 'POST') {
    return { kind: 'local' };
  }
  if (url.pathname === '/api/v1/rewards/ssv' && request.method === 'GET') {
    return { kind: 'local' };
  }
  if (url.pathname !== '/api/v1/rewards/claim' || request.method !== 'POST') {
    return reject(405, 'METHOD_NOT_ALLOWED', 'Reward route or method is not supported.');
  }

  const body = new Uint8Array(await request.clone().arrayBuffer());
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return reject(400, 'INVALID_REQUEST', 'Request body must be valid JSON.');
  }

  if (isChallengeClaim(parsed)) return { kind: 'local' };
  if (!isExactLegacyRewardClaim(parsed)) {
    return reject(400, 'INVALID_REQUEST', 'Reward claim payload is invalid.');
  }

  const deadlineMs = Date.parse(legacyForwardUntil);
  if (!Number.isFinite(deadlineMs)) {
    return reject(503, 'LEGACY_FORWARDING_NOT_CONFIGURED', 'Legacy reward forwarding is unavailable.');
  }
  if (nowMs >= deadlineMs) {
    return reject(410, 'LEGACY_REWARD_FLOW_EXPIRED', 'Legacy reward flow has expired.');
  }
  return { kind: 'forward', body };
}
```

Use `Object.keys(value).sort()` and require exactly `['identifier', 'reward_type']`. Reuse existing daily/weekly identifier validation rather than adding a second regex implementation.

- [ ] **Step 4: Run classifier tests**

Run:

```bash
npm test -- --run tests/transition/rewardTransition.test.ts
```

Expected: PASS for exact forwarding, deadline, malformed JSON, mixed payload, secure local claim, prepare/SSV local handling, and unsupported route/method cases.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/transition/rewardTransition.ts \
  backend/tests/transition/rewardTransition.test.ts \
  backend/src/utils/validators.ts
git commit -m "feat(ssv-transition): classify reward traffic safely"
```

---

### Task 2: Focused Transition Worker Entrypoint

**Files:**
- Create: `backend/src/transition/index.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/src/workers/reward.ts`
- Test: `backend/tests/transition/rewardTransition.test.ts`

**Interfaces:**
- Consumes: `registerRewardRoutes`, `jwtAuthMiddleware`, `classifyRewardRequest`.
- Produces:
  - `createRewardTransitionWorker(options?: TransitionWorkerOptions): ExportedHandler<TransitionEnv>`
  - `TransitionEnv` with `DB`, `CACHE`, `JWT_SECRET`, `ADMOB_REWARDED_ID`, `LEGACY_REWARD_FORWARD_UNTIL` only.
  - `originFetcher?: (request: Request) => Promise<Response>` injection seam for tests; default is global `fetch`.

- [ ] **Step 1: Write failing dispatch tests**

Add tests that inject a local app handler and origin fetcher:

```ts
it('forwards approved legacy traffic with unchanged URL headers and bytes', async () => {
  const seen: Request[] = [];
  const worker = createRewardTransitionWorker({
    nowMs: () => Date.parse('2026-07-26T20:00:00Z'),
    originFetcher: async (request) => {
      seen.push(request.clone());
      return Response.json({ forwarded: true }, { status: 202 });
    }
  });
  const raw = '{"reward_type":"daily","identifier":"2026-07-26"}';
  const request = new Request('https://astrology.parsfilo.com/api/v1/rewards/claim?source=legacy', {
    method: 'POST',
    headers: {
      authorization: 'Bearer legacy-token',
      'content-type': 'application/json'
    },
    body: raw
  });

  const response = await worker.fetch(request, transitionEnv(), executionContext());

  expect(response.status).toBe(202);
  expect(seen).toHaveLength(1);
  expect(seen[0]?.url).toBe(request.url);
  expect(seen[0]?.headers.get('authorization')).toBe('Bearer legacy-token');
  expect(await seen[0]?.text()).toBe(raw);
});

it('never calls the origin for secure claims', async () => {
  const originFetcher = vi.fn();
  const worker = createRewardTransitionWorker({ originFetcher });
  const response = await worker.fetch(
    jsonRequest('/api/v1/rewards/claim', { challenge_id: crypto.randomUUID() }),
    transitionEnv(),
    executionContext()
  );
  expect(originFetcher).not.toHaveBeenCalled();
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: Run tests and verify red state**

Expected: FAIL because `createRewardTransitionWorker` and `TransitionEnv` do not exist.

- [ ] **Step 3: Extract a focused reward app**

Expose a helper in `backend/src/workers/reward.ts` that registers the existing secure routes onto a supplied Hono app without importing unrelated routes. In `backend/src/transition/index.ts`:

```ts
export function createRewardTransitionWorker(
  options: TransitionWorkerOptions = {}
): ExportedHandler<TransitionEnv> {
  const localApp = createLocalRewardApp(options.rewardDependencies);
  const originFetcher = options.originFetcher ?? ((request: Request) => fetch(request));
  const nowMs = options.nowMs ?? Date.now;

  return {
    async fetch(request, env, ctx) {
      const decision = await classifyRewardRequest(
        request,
        nowMs(),
        env.LEGACY_REWARD_FORWARD_UNTIL
      );
      if (decision.kind === 'reject') return decision.response;
      if (decision.kind === 'local') return localApp.fetch(request, env, ctx);

      const forwarded = new Request(request, { body: decision.body });
      return originFetcher(forwarded);
    }
  };
}
```

Ensure local middleware sets request ID and authenticates only `/prepare` and `/claim`; `/ssv` remains public. Do not register admin middleware or non-reward routes.

- [ ] **Step 4: Run transition unit tests and existing reward tests**

```bash
npm test -- --run \
  tests/transition/rewardTransition.test.ts \
  tests/workers/rewardSsv.test.ts \
  tests/workers/rewards.test.ts
npm run build
```

Expected: all tests pass and TypeScript confirms the minimum environment is sufficient.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/src/transition/index.ts backend/src/types.ts \
  backend/src/workers/reward.ts backend/tests/transition/rewardTransition.test.ts
git commit -m "feat(ssv-transition): add focused reward worker"
```

---

### Task 3: Dedicated Wrangler Configuration and Runtime Tests

**Files:**
- Create: `backend/wrangler.transition.toml`
- Create: `backend/tests/runtime/transition-worker-runtime.test.ts`
- Modify: `backend/vitest.runtime.config.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `backend/src/transition/index.ts`.
- Produces package scripts:
  - `build:transition`
  - `test:runtime:transition`
  - `deploy:transition`

- [ ] **Step 1: Write runtime tests**

Test real Worker bindings through the Cloudflare pool/runtime:

```ts
it('rejects malformed SSV publicly through the transition entrypoint', async () => {
  const response = await transitionWorker.fetch(
    'https://astrology.parsfilo.com/api/v1/rewards/ssv?preflight=invalid'
  );
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'MALFORMED_CALLBACK' }
  });
});

it('requires JWT for secure prepare', async () => {
  const response = await transitionWorker.fetch(
    'https://astrology.parsfilo.com/api/v1/rewards/prepare',
    { method: 'POST', body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' }) }
  );
  expect(response.status).toBe(401);
});

it('does not serve a non-reward route', async () => {
  const response = await transitionWorker.fetch(
    'https://astrology.parsfilo.com/api/v1/health'
  );
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Add dedicated config**

Create `wrangler.transition.toml` with exact production resources:

```toml
name = "astrology-ssv-transition"
main = "src/transition/index.ts"
compatibility_date = "2026-04-05"
workers_dev = false

[[d1_databases]]
binding = "DB"
database_name = "astrology-db"
database_id = "ccbbb9fa-56f6-4601-85d7-447288a11056"

[[kv_namespaces]]
binding = "CACHE"
id = "12c50600e61447c29ed0bcb122f5cc85"

[vars]
LEGACY_REWARD_FORWARD_UNTIL = "1970-01-01T00:00:00Z"
```

The committed date is deliberately expired and fail-closed. The reviewed deployment workflow renders a temporary route-free config with its validated future UTC input; the committed file is never edited in place.

- [ ] **Step 3: Add package scripts**

```json
{
  "build:transition": "wrangler deploy --dry-run --config wrangler.transition.toml --outdir dist/transition",
  "test:runtime:transition": "vitest run --config vitest.transition-runtime.config.ts",
  "deploy:transition": "wrangler deploy --config wrangler.transition.toml"
}
```

Use a dedicated runtime Vitest config if the existing pool cannot host two entrypoints cleanly; do not make the main runtime suite dependent on transition-only vars.

- [ ] **Step 4: Run runtime/build verification**

```bash
npm run build
npm run build:transition
npm run test:runtime
npm run test:runtime:transition
```

Expected: the generated transition bundle has no R2/admin/Firebase/Play bindings and all runtime tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/wrangler.transition.toml backend/package.json \
  backend/tests/runtime/transition-worker-runtime.test.ts \
  backend/vitest.runtime.config.ts backend/vitest.transition-runtime.config.ts
git commit -m "build(ssv-transition): configure isolated worker"
```

---

### Task 4: Minimum Secret Sync and Verification Challenge Provisioning

**Files:**
- Create: `backend/scripts/sync-transition-secrets.ts`
- Create: `backend/scripts/create-admob-verification-challenge.ts`
- Create: `backend/tests/scripts/transitionShared.test.ts`
- Modify: `backend/scripts/shared.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces:
  - `TRANSITION_SECRET_NAMES = ['JWT_SECRET', 'ADMOB_REWARDED_ID'] as const`
  - `resolveTransitionSecrets(downloaded): Record<TransitionSecretName, string>`
  - CLI commands:
    - `npm run transition:secrets`
    - `npm run transition:challenge:create`
    - `npm run transition:challenge:inspect -- <challenge-id>`
    - `npm run transition:challenge:delete -- <challenge-id>`

- [ ] **Step 1: Write secret and challenge helper tests**

```ts
it('selects only transition secrets', () => {
  expect(resolveTransitionSecrets({
    JWT_SECRET: 'jwt',
    ADMOB_REWARDED_ID: 'ca-app-pub-x/y',
    ADMIN_SECRET: 'must-not-be-synced'
  })).toEqual({
    JWT_SECRET: 'jwt',
    ADMOB_REWARDED_ID: 'ca-app-pub-x/y'
  });
});

it('formats verification output without full identifiers', () => {
  const evidence = formatVerificationEvidence({
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'admob-verify-secret-user',
    status: 'verified',
    transaction_id: '18fa792de1bca816048293fc71035638',
    expires_at: '2026-07-26T20:15:00.000Z'
  });
  expect(evidence).toEqual({
    challengePrefix: '11111111',
    userPrefix: 'admob-verify-',
    status: 'verified',
    transactionPrefix: '18fa792d',
    expiresAt: '2026-07-26T20:15:00.000Z'
  });
});
```

- [ ] **Step 2: Implement transition-only secret sync**

Invoke Wrangler with the transition config and worker name:

```ts
execFileSync('npx', [
  'wrangler', 'secret', 'put', name,
  '--config', 'wrangler.transition.toml'
], { input: secrets[name], stdio: ['pipe', 'inherit', 'inherit'] });
```

Never iterate over the full backend secret list.

- [ ] **Step 3: Implement verification challenge CLI**

Create mode inserts:

```sql
INSERT INTO reward_challenges
(id, user_id, reward_type, identifier, status, transaction_id, ad_unit,
 callback_timestamp_ms, created_at, expires_at, verified_at, consumed_at,
 entitlement_expires_at)
VALUES (?, ?, 'daily', ?, 'pending', NULL, NULL, NULL, ?, ?, NULL, NULL, NULL)
```

Generate:

```ts
const challengeId = crypto.randomUUID();
const userId = `admob-verify-${crypto.randomUUID()}`;
const createdAt = new Date();
const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
const identifier = createdAt.toISOString().slice(0, 10);
```

The create command may print the full test `userId` and `challengeId` exactly once for the human AdMob form, but must label them as short-lived test values and must not write them to GitHub logs. Inspect mode prints only prefixes. Delete mode requires the exact UUID and removes only rows with `user_id LIKE 'admob-verify-%'`.

- [ ] **Step 4: Run script tests and dry-run bundle**

```bash
npm test -- --run tests/scripts/transitionShared.test.ts
npm run build
npm run build:transition
```

- [ ] **Step 5: Commit Task 4**

```bash
git add backend/scripts/shared.ts backend/scripts/sync-transition-secrets.ts \
  backend/scripts/create-admob-verification-challenge.ts \
  backend/tests/scripts/transitionShared.test.ts backend/package.json
git commit -m "feat(ssv-transition): add minimal secrets and test challenge tools"
```

---

### Task 5: Live Route Smoke Checker

**Files:**
- Create: `scripts/check-ssv-transition-route.mjs`
- Create: `scripts/check-ssv-transition-route.test.mjs`

**Interfaces:**
- Produces `checkSsvTransitionRoute({ baseUrl, fetcher, timeoutMs, legacyJwt })` returning structured evidence.

- [ ] **Step 1: Write injected-fetcher tests**

Cover:

```js
it('requires origin health and transition malformed callback behavior', async () => {
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/health') return Response.json({ status: 'ok' });
    if (path === '/api/v1/rewards/ssv') {
      return Response.json({ error: { code: 'MALFORMED_CALLBACK' } }, { status: 400 });
    }
    if (path === '/api/v1/rewards/claim') {
      return Response.json({ error: { code: 'INVALID_TOKEN' } }, { status: 401 });
    }
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  };
  await expect(checkSsvTransitionRoute({
    baseUrl: 'https://astrology.parsfilo.com',
    fetcher,
    legacyJwt: 'invalid-smoke-token'
  })).resolves.toMatchObject({
    originHealth: 200,
    malformedSsv: 400,
    malformedSsvCode: 'MALFORMED_CALLBACK',
    legacyOriginResponse: 401
  });
});
```

Also test timeout abort, unsupported reward route local rejection, invalid JSON local rejection, and no raw response bodies in evidence.

- [ ] **Step 2: Implement bounded live checks**

Perform four requests with one AbortController per request:

1. `GET /api/v1/health` -> 200, proving unrelated traffic remains on origin.
2. `GET /api/v1/rewards/ssv?preflight=invalid` -> 400 `MALFORMED_CALLBACK`, proving route interception.
3. `POST /api/v1/rewards/claim` with exact legacy body and invalid bearer -> origin authentication response 401, proving controlled forwarding.
4. `POST /api/v1/rewards/unsupported` -> local 405/404, proving no arbitrary forwarding.

- [ ] **Step 3: Run tests**

```bash
node --test scripts/check-ssv-transition-route.test.mjs
```

- [ ] **Step 4: Commit Task 5**

```bash
git add scripts/check-ssv-transition-route.mjs scripts/check-ssv-transition-route.test.mjs
git commit -m "test(ssv-transition): add live route smoke checker"
```

---

### Task 6: Reviewed Deployment and Rollback Workflows

**Files:**
- Create: `.github/workflows/backend-ssv-transition-deploy.yml`
- Create: `.github/workflows/backend-ssv-transition-rollback.yml`
- Create: `scripts/backend-ssv-transition-workflows.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Deploy inputs:
  - `confirm = DEPLOY_TRANSITION`
  - `legacy_forward_until` ISO UTC timestamp
- Rollback input:
  - `confirm = REMOVE_TRANSITION_ROUTE`

- [ ] **Step 1: Write workflow regression tests first**

Assert exact ordering:

```js
const migration = deploy.indexOf('migrate-reward-ssv.sql');
const deployWorker = deploy.indexOf('deploy:transition');
const secretSync = deploy.indexOf('transition:secrets');
const routeSmoke = deploy.indexOf('check-ssv-transition-route.mjs');
assert.ok(migration < deployWorker && deployWorker < secretSync && secretSync < routeSmoke);
assert.match(deploy, /ENABLE_PRODUCTION_RELEASE/);
assert.match(deploy, /false/);
assert.doesNotMatch(deploy, /deploy:doppler/);
assert.doesNotMatch(deploy, /astrology-backend[^-]/);
```

Rollback test must assert the route is removed before optional Worker deletion and that origin health is checked after removal.

- [ ] **Step 2: Implement deploy workflow**

Required sequence:

1. Require `main`, production environment, and exact confirmation.
2. Validate `legacy_forward_until` is future UTC and no more than 30 days ahead.
3. Assert repository variable `ENABLE_PRODUCTION_RELEASE == 'false'`; abort otherwise.
4. Build/test main backend and transition bundle.
5. Install Doppler and load `CLOUDFLARE_API_TOKEN` only into masked environment.
6. Apply `backend/scripts/migrate-reward-ssv.sql` remotely.
7. Render a temporary route-free Wrangler config with the reviewed deadline; do not edit the committed file in place.
8. Deploy `astrology-ssv-transition` while it has no route, then run `npm run transition:secrets` and verify the exact two-secret inventory.
9. Attach `astrology.parsfilo.com/api/v1/rewards/*` through the Cloudflare Routes API.
10. Run `node ../scripts/check-ssv-transition-route.mjs`.
11. Record Worker deployment ID, route pattern, zone ID, deadline, D1 result, and rollback workflow name in `$GITHUB_STEP_SUMMARY`.

- [ ] **Step 3: Implement rollback workflow**

Rollback must:

1. Require exact confirmation and production environment.
2. Remove only the route `astrology.parsfilo.com/api/v1/rewards/*`.
3. Verify `/api/v1/health` is 200.
4. Verify malformed `/api/v1/rewards/ssv` again returns the origin's old 403, proving fall-through.
5. Leave D1 migration intact.
6. Optionally delete `astrology-ssv-transition` only after route removal succeeds.

- [ ] **Step 4: Run workflow tests and YAML parser**

```bash
node --test scripts/backend-ssv-transition-workflows.test.mjs
ruby -e "require 'yaml'; Dir['.github/workflows/*.yml'].each { |f| YAML.load_file(f) }"
```

- [ ] **Step 5: Commit Task 6**

```bash
git add .github/workflows/backend-ssv-transition-deploy.yml \
  .github/workflows/backend-ssv-transition-rollback.yml \
  .github/workflows/ci.yml scripts/backend-ssv-transition-workflows.test.mjs
git commit -m "ci(ssv-transition): add reviewed deploy and rollback"
```

---

### Task 7: Runbook, Evidence, and Full Verification

**Files:**
- Modify: `docs/PLAY_PRODUCTION_READINESS.md`
- Modify: `RELEASE_RUNBOOK.md`
- Modify: `backend/README.md`

**Interfaces:**
- Produces an exact operator checklist for the AdMob form and rollback.

- [ ] **Step 1: Document the human AdMob step**

Document these exact fields:

```text
Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
User ID: output of transition:challenge:create
Custom data: output challenge UUID from transition:challenge:create
```

Specify: click **URL'yi doğrula**, require success, then **Doğrulanan URL'yi kullan**, then **Kaydet**. Do not save on failed verification.

- [ ] **Step 2: Document evidence and cleanup**

Require:

- deployment ID and route pattern;
- compatibility deadline;
- D1 migration success;
- malformed callback 400 result;
- challenge prefix, expiry, verified status, transaction prefix;
- challenge deletion after evidence;
- internal preflight URL/result;
- rollback workflow reference.

- [ ] **Step 3: Run complete repository verification**

```bash
cd backend
npm run build
npm test
npm run test:runtime
npm run build:transition
npm run test:runtime:transition
cd ..
node --test scripts/*.test.mjs
node scripts/validate-play-metadata.mjs
node scripts/scan-secrets.mjs
ruby -e "require 'yaml'; Dir['.github/workflows/*.yml'].each { |f| YAML.load_file(f) }"
git diff --check origin/main...HEAD
```

Expected:

- all backend and transition tests pass;
- both Worker bundles build;
- no secret or YAML findings;
- Play metadata remains valid;
- no whitespace errors.

- [ ] **Step 4: Commit documentation and verification record**

```bash
git add docs/PLAY_PRODUCTION_READINESS.md RELEASE_RUNBOOK.md backend/README.md
git commit -m "docs(ssv-transition): record rollout and rollback"
```

---

### Task 8: PR, Merge, and Production Transition Deployment

**Files:**
- No new source files; operational execution against the completed branch.

**Interfaces:**
- Produces: merged PR, deployed transition Worker, attached route, and one-time AdMob test values.

- [ ] **Step 1: Push branch and open PR**

```bash
git push -u origin feat/ssv-transition-router-20260726
gh pr create \
  --base main \
  --head feat/ssv-transition-router-20260726 \
  --title "feat: add reversible rewarded SSV transition router" \
  --body-file /tmp/ssv-transition-pr.md
```

PR body must explicitly say the full `astrology-backend` is not deployed by this change.

- [ ] **Step 2: Resolve review findings and require green CI**

Require secret scan, backend/transition tests, runtime tests, workflow regression tests, CodeRabbit, Semgrep, and GitGuardian to pass on the final SHA.

- [ ] **Step 3: Squash merge after all gates pass**

Merge only when `mergeable = true` and `mergeStateStatus = CLEAN`.

- [ ] **Step 4: Create Cloudflare deployment review plan**

Record:

```text
Target: astrology-ssv-transition and route astrology.parsfilo.com/api/v1/rewards/*
Expected state: astrology-backend Custom Domain handles all paths; SSV malformed callback returns old 403
Desired state: transition Worker handles reward paths; origin remains unchanged for all other paths
```

- [ ] **Step 5: Dispatch transition deployment workflow**

Use a deadline no more than 14 days after deployment unless a shorter product rollout window is known. Do not dispatch the full backend production workflow.

- [ ] **Step 6: Provision one-time AdMob verification values**

Run the challenge create command outside GitHub Actions so the full short-lived values are shown only in the operator session. Send the user exactly the `User ID` and `Custom data` values plus the callback URL.

- [ ] **Step 7: Pause for the user's AdMob verification action**

The user performs the panel-only action. Do not proceed to internal release until the signed callback changes the D1 row to `verified`.

- [ ] **Step 8: Verify signed callback and clean test data**

Inspect by exact challenge ID, record only prefixes/status/expiry, then delete the test challenge.

- [ ] **Step 9: Run Android internal preflight**

Dispatch `android-internal-preflight` from `main`. Do not publish to production. Report pass/fail and preserve `ENABLE_PRODUCTION_RELEASE=false`.
