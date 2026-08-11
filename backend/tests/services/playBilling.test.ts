import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createGoogleAccessTokenMock } = vi.hoisted(() => ({
  createGoogleAccessTokenMock: vi.fn()
}));

vi.mock('@/utils/jwt', () => ({ createGoogleAccessToken: createGoogleAccessTokenMock }));

import {
  consumeProductPurchase,
  getSubscriptionStatus,
  hasPremiumEntitlement,
  isConsumableProductPurchaseValid,
  normalizeSubscriptionState,
  verifyProductPurchase
} from '@/services/playBilling';
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

describe('play billing consumable product purchases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createGoogleAccessTokenMock.mockReset();
  });

  it('accepts only a purchased, not-yet-consumed product', () => {
    expect(isConsumableProductPurchaseValid({ purchaseState: 0, consumptionState: 0 })).toBe(true);
    expect(isConsumableProductPurchaseValid({ purchaseState: 1, consumptionState: 0 })).toBe(false);
    expect(isConsumableProductPurchaseValid({ purchaseState: 0, consumptionState: 1 })).toBe(false);
  });

  it('fetches the product purchase from the Play Developer API', async () => {
    createGoogleAccessTokenMock.mockResolvedValue('google-access-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ purchaseState: 0, consumptionState: 0, orderId: 'order-1' })
    );

    const result = await verifyProductPurchase(
      createTestEnv(),
      'purchase-token',
      'credits_medium',
      'com.example.astrology'
    );

    expect(result).toEqual({ purchaseState: 0, consumptionState: 0, orderId: 'order-1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/purchases/products/credits_medium/tokens/purchase-token'
      ),
      expect.anything()
    );
  });

  it('returns null for an unknown purchase token', async () => {
    createGoogleAccessTokenMock.mockResolvedValue('google-access-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));

    const result = await verifyProductPurchase(
      createTestEnv(),
      'missing-token',
      'credits_medium',
      'com.example.astrology'
    );

    expect(result).toBeNull();
  });

  it('marks the purchase consumed via the Play Developer API', async () => {
    createGoogleAccessTokenMock.mockResolvedValue('google-access-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await consumeProductPurchase(createTestEnv(), 'purchase-token', 'credits_medium', 'com.example.astrology');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/purchases/products/credits_medium/tokens/purchase-token:consume'
      ),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
