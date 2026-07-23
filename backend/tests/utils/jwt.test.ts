import { describe, expect, it, vi } from 'vitest';

import { signAppJwt, verifyAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

describe('jwt utils', () => {
  it('issues app JWTs that expire within one hour', async () => {
    const env = createTestEnv();

    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: true,
      firebaseUid: 'firebase-1'
    });

    const claims = await verifyAppJwt(env, jwt);

    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60 * 60);
    expect(claims.is_premium).toBe(true);
    expect(claims.user_id).toBe('user-1');
  });

  it('issues distinct tokens for identical claims in the same second', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    const env = createTestEnv();

    try {
      const first = await signAppJwt(env, {
        userId: 'user-1',
        isPremium: false,
        firebaseUid: 'firebase-1'
      });
      const second = await signAppJwt(env, {
        userId: 'user-1',
        isPremium: false,
        firebaseUid: 'firebase-1'
      });

      const firstClaims = await verifyAppJwt(env, first);
      const secondClaims = await verifyAppJwt(env, second);

      expect(firstClaims.jti).toBeDefined();
      expect(secondClaims.jti).toBeDefined();
      expect(secondClaims.jti).not.toBe(firstClaims.jti);
      expect(second).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
