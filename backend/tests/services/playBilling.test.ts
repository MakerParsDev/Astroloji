import { describe, expect, it } from 'vitest';

import { hasPremiumEntitlement, normalizeSubscriptionState } from '@/services/playBilling';

describe('play billing subscription normalization', () => {
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
});
