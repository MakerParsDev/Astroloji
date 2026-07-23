import { describe, expect, it } from 'vitest';

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
});
