import { describe, expect, it, vi } from 'vitest';

import type { RateLimitBucket } from '@/durable/RateLimitBucket';
import {
  buildRateLimitObjectName,
  enforceStrictRateLimit,
  mapStrictRateLimitResult,
  type RateLimitDecision
} from '@/services/rateLimit';

function createNamespace(check: (input: { limit: number; windowSeconds: number }) => Promise<RateLimitDecision>) {
  let requestedName: string | null = null;
  let getCalls = 0;
  const namespace = {
    getByName(name: string) {
      getCalls += 1;
      requestedName = name;
      return { check };
    }
  } as unknown as DurableObjectNamespace<RateLimitBucket>;

  return {
    namespace,
    requestedName: () => requestedName,
    getCalls: () => getCalls
  };
}

describe('buildRateLimitObjectName', () => {
  it('is deterministic, hashed, and does not expose the raw principal', async () => {
    const first = await buildRateLimitObjectName('content:daily', 'user-sensitive-123');
    const same = await buildRateLimitObjectName('content:daily', 'user-sensitive-123');
    const otherRoute = await buildRateLimitObjectName('chart', 'user-sensitive-123');
    const otherPrincipal = await buildRateLimitObjectName('content:daily', 'another-user');

    expect(first).toBe(same);
    expect(first).toMatch(/^rl:[0-9a-f]{64}$/);
    expect(first).not.toContain('user-sensitive-123');
    expect(otherRoute).not.toBe(first);
    expect(otherPrincipal).not.toBe(first);
  });
});

describe('enforceStrictRateLimit', () => {
  it('routes a valid decision through the deterministic object name', async () => {
    const decision: RateLimitDecision = { allowed: true, remaining: 2, retryAfterSeconds: 0 };
    const check = vi.fn(async () => decision);
    const harness = createNamespace(check);

    const result = await enforceStrictRateLimit(
      { RATE_LIMITER: harness.namespace },
      'chart',
      'user-123',
      3,
      60
    );

    expect(result).toEqual({ status: 'ok', decision });
    expect(harness.requestedName()).toMatch(/^rl:[0-9a-f]{64}$/);
    expect(harness.requestedName()).not.toContain('user-123');
    expect(check).toHaveBeenCalledWith({ limit: 3, windowSeconds: 60 });
  });

  it('returns unavailable when namespace lookup fails', async () => {
    const namespace = {
      getByName() {
        throw new Error('namespace unavailable');
      }
    } as unknown as DurableObjectNamespace<RateLimitBucket>;

    await expect(
      enforceStrictRateLimit({ RATE_LIMITER: namespace }, 'chart', 'user-123', 3, 60)
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns unavailable when the Durable Object RPC rejects', async () => {
    const harness = createNamespace(async () => {
      throw new Error('rpc unavailable');
    });

    await expect(
      enforceStrictRateLimit({ RATE_LIMITER: harness.namespace }, 'chart', 'user-123', 3, 60)
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('does not classify invalid policy as an availability failure', async () => {
    const getByName = vi.fn(() => {
      throw new Error('must not be called');
    });
    const namespace = { getByName } as unknown as DurableObjectNamespace<RateLimitBucket>;

    await expect(
      enforceStrictRateLimit({ RATE_LIMITER: namespace }, 'chart', 'user-123', 0, 60)
    ).rejects.toThrow(RangeError);
    expect(getByName).not.toHaveBeenCalled();
  });
});


describe('mapStrictRateLimitResult', () => {
  it('returns null for an allowed strict decision', () => {
    expect(
      mapStrictRateLimitResult({
        status: 'ok',
        decision: { allowed: true, remaining: 2, retryAfterSeconds: 0 }
      })
    ).toBeNull();
  });

  it('maps quota denial to a sanitized 429 with Retry-After', async () => {
    const response = mapStrictRateLimitResult({
      status: 'ok',
      decision: { allowed: false, remaining: 0, retryAfterSeconds: 17 }
    });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('17');
    await expect(response?.json()).resolves.toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests.' }
    });
  });

  it('maps adapter failure to a sanitized fail-closed 503', async () => {
    const response = mapStrictRateLimitResult({ status: 'unavailable' });
    expect(response?.status).toBe(503);
    expect(response?.headers.get('retry-after')).toBeNull();
    await expect(response?.json()).resolves.toEqual({
      error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit service unavailable.' }
    });
  });
});
