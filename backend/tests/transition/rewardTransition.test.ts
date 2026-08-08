import { describe, expect, it, vi } from 'vitest';

import { createRewardTransitionWorker } from '@/transition';
import type { TransitionEnv } from '@/types';
import {
  classifyRewardRequest,
  isExactLegacyRewardClaim
} from '@/transition/rewardTransition';

const NOW = Date.parse('2026-07-26T20:00:00Z');
const DEADLINE = '2026-08-09T00:00:00Z';

function request(
  path: string,
  options: RequestInit = {}
): Request {
  return new Request(`https://astrology.parsfilo.com${path}`, options);
}

function jsonRequest(path: string, body: unknown, method = 'POST'): Request {
  return request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function expectReject(
  decision: Awaited<ReturnType<typeof classifyRewardRequest>>,
  status: number,
  code: string
): Promise<void> {
  expect(decision.kind).toBe('reject');
  if (decision.kind !== 'reject') {
    throw new Error(`Expected reject decision, got ${decision.kind}.`);
  }
  expect(decision.response.status).toBe(status);
  await expect(decision.response.json()).resolves.toMatchObject({
    error: { code }
  });
}

describe('isExactLegacyRewardClaim', () => {
  it('accepts only valid two-key daily and weekly legacy payloads', () => {
    expect(
      isExactLegacyRewardClaim({ reward_type: 'daily', identifier: '2026-07-26' })
    ).toBe(true);
    expect(
      isExactLegacyRewardClaim({ reward_type: 'weekly', identifier: '2026-W30' })
    ).toBe(true);
  });

  it.each([
    null,
    [],
    { reward_type: 'daily', identifier: '2026-07-26', extra: true },
    { reward_type: 'daily', identifier: '2026-07-26', challenge_id: crypto.randomUUID() },
    { reward_type: 'daily', identifier: 'bad-date' },
    { reward_type: 'weekly', identifier: '2026-07-26' },
    { reward_type: 'unknown', identifier: '2026-07-26' }
  ])('rejects non-exact legacy value %#', (value) => {
    expect(isExactLegacyRewardClaim(value)).toBe(false);
  });
});

describe('classifyRewardRequest', () => {
  it('forwards only an exact legacy claim before the deadline and preserves body bytes', async () => {
    const rawBody = '{\n  "reward_type": "daily",\n  "identifier": "2026-07-26"\n}';
    const decision = await classifyRewardRequest(
      request('/api/v1/rewards/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: rawBody
      }),
      NOW,
      DEADLINE
    );

    expect(decision.kind).toBe('forward');
    if (decision.kind !== 'forward') {
      throw new Error(`Expected forward decision, got ${decision.kind}.`);
    }
    expect(new TextDecoder().decode(decision.body)).toBe(rawBody);
  });

  it.each([
    { reward_type: 'daily', identifier: '2026-07-26', extra: true },
    { reward_type: 'daily', identifier: '2026-07-26', challenge_id: crypto.randomUUID() },
    { reward_type: 'daily', identifier: 'bad-date' },
    { reward_type: 'unknown', identifier: '2026-07-26' }
  ])('rejects non-exact legacy payload %#', async (body) => {
    const decision = await classifyRewardRequest(
      jsonRequest('/api/v1/rewards/claim', body),
      NOW,
      DEADLINE
    );

    await expectReject(decision, 400, 'INVALID_REQUEST');
  });

  it('handles challenge claims locally', async () => {
    const decision = await classifyRewardRequest(
      jsonRequest('/api/v1/rewards/claim', { challenge_id: crypto.randomUUID() }),
      NOW,
      DEADLINE
    );

    expect(decision).toEqual({ kind: 'local' });
  });

  it.each([
    ['POST', '/api/v1/rewards/prepare'],
    ['GET', '/api/v1/rewards/ssv?signature=invalid']
  ])('handles secure %s %s locally', async (method, path) => {
    const decision = await classifyRewardRequest(
      request(path, { method }),
      NOW,
      DEADLINE
    );

    expect(decision).toEqual({ kind: 'local' });
  });

  it('expires legacy forwarding at the exact deadline', async () => {
    const decision = await classifyRewardRequest(
      jsonRequest('/api/v1/rewards/claim', {
        reward_type: 'weekly',
        identifier: '2026-W30'
      }),
      Date.parse(DEADLINE),
      DEADLINE
    );

    await expectReject(decision, 410, 'LEGACY_REWARD_FLOW_EXPIRED');
  });

  it('fails closed when the forwarding deadline is invalid', async () => {
    const decision = await classifyRewardRequest(
      jsonRequest('/api/v1/rewards/claim', {
        reward_type: 'daily',
        identifier: '2026-07-26'
      }),
      NOW,
      'not-a-date'
    );

    await expectReject(decision, 503, 'LEGACY_FORWARDING_NOT_CONFIGURED');
  });

  it('rejects malformed JSON locally', async () => {
    const decision = await classifyRewardRequest(
      request('/api/v1/rewards/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{'
      }),
      NOW,
      DEADLINE
    );

    await expectReject(decision, 400, 'INVALID_REQUEST');
  });

  it.each([
    ['GET', '/api/v1/rewards/claim'],
    ['PUT', '/api/v1/rewards/prepare'],
    ['POST', '/api/v1/rewards/ssv'],
    ['POST', '/api/v1/rewards/unknown']
  ])('rejects unsupported reward request %s %s locally', async (method, path) => {
    const decision = await classifyRewardRequest(
      request(path, { method }),
      NOW,
      DEADLINE
    );

    await expectReject(decision, 405, 'METHOD_NOT_ALLOWED');
  });

  it('rejects non-reward paths without forwarding', async () => {
    const decision = await classifyRewardRequest(
      request('/api/v1/health'),
      NOW,
      DEADLINE
    );

    await expectReject(decision, 404, 'NOT_FOUND');
  });
});


function transitionEnv(overrides: Partial<TransitionEnv> = {}): TransitionEnv {
  return {
    DB: {} as D1Database,
    CACHE: {} as KVNamespace,
    RATE_LIMITER: {
      getByName() {
        return {
          async check() {
            return { allowed: true, remaining: 999, retryAfterSeconds: 0 };
          }
        };
      }
    } as unknown as TransitionEnv['RATE_LIMITER'],
    JWT_SECRET: 'transition-jwt-secret',
    ADMOB_REWARDED_ID: 'ca-app-pub-1234567890123456/1234567890',
    LEGACY_REWARD_FORWARD_UNTIL: DEADLINE,
    ...overrides
  };
}

function executionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {}
  } as unknown as ExecutionContext;
}

describe('createRewardTransitionWorker', () => {
  it('forwards approved legacy traffic with unchanged URL headers and bytes', async () => {
    const seen: Array<{
      url: string;
      method: string;
      headers: Headers;
      body: string;
    }> = [];
    const worker = createRewardTransitionWorker({
      nowMs: () => NOW,
      originFetcher: async (forwardedRequest) => {
        const clone = forwardedRequest.clone();
        seen.push({
          url: clone.url,
          method: clone.method,
          headers: new Headers(clone.headers),
          body: await clone.text()
        });
        return Response.json({ forwarded: true }, { status: 202 });
      }
    });
    const raw = '{\n  "reward_type": "daily",\n  "identifier": "2026-07-26"\n}';
    const original = request('/api/v1/rewards/claim?source=legacy', {
      method: 'POST',
      headers: {
        authorization: 'Bearer legacy-token',
        'content-type': 'application/json',
        'x-client-version': '1.0.0'
      },
      body: raw
    });

    const response = await worker.fetch(original, transitionEnv(), executionContext());

    expect(response.status).toBe(202);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(original.url);
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer legacy-token');
    expect(seen[0]?.headers.get('content-type')).toBe('application/json');
    expect(seen[0]?.headers.get('x-client-version')).toBe('1.0.0');
    expect(seen[0]?.body).toBe(raw);
  });

  it('never calls the origin for secure challenge claims', async () => {
    const originFetcher = vi.fn<() => Promise<Response>>();
    const worker = createRewardTransitionWorker({ originFetcher });

    const response = await worker.fetch(
      jsonRequest('/api/v1/rewards/claim', { challenge_id: crypto.randomUUID() }),
      transitionEnv(),
      executionContext()
    );

    expect(originFetcher).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' }
    });
  });

  it('handles secure prepare locally and requires JWT', async () => {
    const originFetcher = vi.fn<() => Promise<Response>>();
    const worker = createRewardTransitionWorker({ originFetcher });

    const response = await worker.fetch(
      jsonRequest('/api/v1/rewards/prepare', {
        reward_type: 'daily',
        identifier: '2026-07-26'
      }),
      transitionEnv(),
      executionContext()
    );

    expect(originFetcher).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('handles malformed SSV callbacks locally without authentication', async () => {
    const originFetcher = vi.fn<() => Promise<Response>>();
    const worker = createRewardTransitionWorker({ originFetcher });

    const response = await worker.fetch(
      request('/api/v1/rewards/ssv?preflight=invalid'),
      transitionEnv(),
      executionContext()
    );

    expect(originFetcher).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MALFORMED_CALLBACK' }
    });
  });

  it('returns classifier rejection without calling either handler', async () => {
    const originFetcher = vi.fn<() => Promise<Response>>();
    const worker = createRewardTransitionWorker({ originFetcher });

    const response = await worker.fetch(
      request('/api/v1/health'),
      transitionEnv(),
      executionContext()
    );

    expect(originFetcher).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
