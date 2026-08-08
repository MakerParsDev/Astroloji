import { describe, expect, it } from 'vitest';

import { RATE_LIMIT_POLICIES } from '@/services/rateLimit';
import {
  classifyLiveRateLimitResponses,
  type LiveRateLimitResponse
} from '../../scripts/verify-rate-limit-production';

const validation = (): LiveRateLimitResponse => ({
  status: 400,
  retryAfter: null,
  bodyText: JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'Invalid request.' } })
});

const limited = (): LiveRateLimitResponse => ({
  status: 429,
  retryAfter: '1',
  bodyText: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } })
});

function validBurst(extra = 3): LiveRateLimitResponse[] {
  return [
    ...Array.from({ length: RATE_LIMIT_POLICIES.chart.limit }, validation),
    ...Array.from({ length: extra }, limited)
  ];
}

describe('classifyLiveRateLimitResponses', () => {
  it('accepts only the exact strict limiter pattern', () => {
    expect(classifyLiveRateLimitResponses(validBurst())).toEqual({
      strictRateLimitMatched: true,
      admittedRequestsHitValidation: true,
      rejectedRequestsWereRateLimited: true,
      retryAfterPresent: true
    });
  });

  it('rejects too many or too few admitted responses', () => {
    const tooMany = validBurst();
    tooMany.unshift(validation());
    expect(classifyLiveRateLimitResponses(tooMany).strictRateLimitMatched).toBe(false);

    const tooFew = validBurst();
    tooFew.shift();
    expect(classifyLiveRateLimitResponses(tooFew).strictRateLimitMatched).toBe(false);
  });

  it('rejects missing Retry-After and successful chart execution', () => {
    const missingRetry = validBurst();
    missingRetry.at(-1)!.retryAfter = null;
    expect(classifyLiveRateLimitResponses(missingRetry).strictRateLimitMatched).toBe(false);

    expect(classifyLiveRateLimitResponses([...validBurst(), { status: 200, retryAfter: null, bodyText: '{}' }]).strictRateLimitMatched).toBe(false);
  });

  it('rejects upstream or non-JSON 400/429 responses', () => {
    const bad400 = validBurst();
    bad400[0] = { status: 400, retryAfter: null, bodyText: '<html>bad gateway</html>' };
    expect(classifyLiveRateLimitResponses(bad400).strictRateLimitMatched).toBe(false);

    const bad429 = validBurst();
    bad429[bad429.length - 1] = { status: 429, retryAfter: '1', bodyText: 'rate limited' };
    expect(classifyLiveRateLimitResponses(bad429).strictRateLimitMatched).toBe(false);
  });
});
