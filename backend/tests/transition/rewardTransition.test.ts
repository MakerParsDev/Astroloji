import { describe, expect, it } from 'vitest';

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
