import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createGoogleAccessTokenMock } = vi.hoisted(() => ({
  createGoogleAccessTokenMock: vi.fn()
}));

vi.mock('@/utils/jwt', () => ({ createGoogleAccessToken: createGoogleAccessTokenMock }));

import { getSubscriptionStatus, hasPremiumEntitlement, normalizeSubscriptionState } from '@/services/playBilling';
import { createTestEnv } from '../helpers/env';

describe('play billing subscription normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createGoogleAccessTokenMock.mockReset();
  });

  it('maps grace period and on-hold subscriptions to dedicated states', () => {
    expect(normalizeSubscriptionState('SUBSCRIPTION_STATE_ACTIVE')).toBe('active');
    expect(normalizeSubscriptionState('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')).toBe('grace_period');
    expect(normalizeSubscriptionState('SUBSCRIPTION_STATE_ON_HOLD')).toBe('on_hold');
    expect(normalizeSubscriptionState('SUBSCRIPTION_STATE_PAUSED')).toBe('paused');
    expect(normalizeSubscriptionState('SUBSCRIPTION_STATE_CANCELED')).toBe('cancelled');
  });

  it('keeps entitlement until expiry for cancelled and grace-period subscriptions only', () => {
    expect(
      hasPremiumEntitlement({
        status: 'cancelled',
        expiresAt: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(true);

    expect(
      hasPremiumEntitlement({
        status: 'grace_period',
        expiresAt: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(true);

    expect(
      hasPremiumEntitlement({
        status: 'on_hold',
        expiresAt: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(false);

    expect(
      hasPremiumEntitlement({
        status: 'paused',
        expiresAt: '2099-01-01T00:00:00.000Z'
      })
    ).toBe(false);

    expect(
      hasPremiumEntitlement({
        status: 'expired',
        expiresAt: '2025-01-01T00:00:00.000Z'
      })
    ).toBe(false);
  });
  it('bounds Google Play API calls with a fifteen-second AbortSignal', async () => {
    createGoogleAccessTokenMock.mockResolvedValue('google-access-token');
    const signal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        startTime: '2026-08-08T00:00:00.000Z',
        lineItems: [{ productId: 'premium_weekly', expiryTime: '2026-08-15T00:00:00.000Z' }]
      })
    );

    await getSubscriptionStatus(
      createTestEnv(),
      'purchase-token',
      'premium_weekly',
      'com.example.astrology'
    );

    expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    expect(createGoogleAccessTokenMock).toHaveBeenCalledWith(
      expect.any(String),
      'https://www.googleapis.com/auth/androidpublisher',
      signal
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal })
    );
  });

});
