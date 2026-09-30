import { describe, expect, it } from 'vitest';

import {
  isValidRewardIdentifier,
  normalizeCompatibilityPair,
  sanitizeNotificationData,
  validateContentBackfillBody,
  validateCreditsSpendBody,
  validateCreditsVerifyBody,
  validateRegisterBody,
  validateRewardPrepareBody,
  validateSubscriptionBody,
  validateUpdateUserBody,
  validateLanguage,
  validateNatalChartBody,
  validateSign
} from '@/utils/validators';

describe('validators', () => {
  it('normalizes compatibility pairs alphabetically', () => {
    expect(normalizeCompatibilityPair('leo', 'aries')).toEqual({
      normalizedSign1: 'aries',
      normalizedSign2: 'leo',
      key: 'aries-leo'
    });
  });

  it('accepts valid languages and signs', () => {
    expect(validateLanguage('tr')).toBe('tr');
    expect(validateSign('aquarius')).toBe('aquarius');
  });

  it('drops non-string notification payload values', () => {
    expect(sanitizeNotificationData({ ok: 'yes', count: 2, flag: true, empty: null })).toEqual({
      ok: 'yes'
    });
  });

  it('allows registration before an FCM token is available', () => {
    const body = validateRegisterBody({
      sign: 'aries',
      language: 'tr',
      notification_hour: 9,
      utc_offset: 3,
      platform: 'android'
    });

    expect(body.fcm_token).toBeUndefined();
  });


  it('accepts FIDs and rejects ambiguous dual notification targets', () => {
    expect(
      validateRegisterBody({
        sign: 'aries',
        language: 'tr',
        firebase_installation_id: 'fid-123',
        notification_hour: 9,
        utc_offset: 3,
        platform: 'android'
      }).firebase_installation_id
    ).toBe('fid-123');

    expect(() =>
      validateRegisterBody({
        sign: 'aries',
        language: 'tr',
        fcm_token: 'legacy-token',
        firebase_installation_id: 'fid-123',
        notification_hour: 9,
        utc_offset: 3,
        platform: 'android'
      })
    ).toThrow('Provide either fcm_token or firebase_installation_id, not both.');
  });


  it('rejects impossible UTC calendar timestamps and accepts leap days', () => {
    expect(() =>
      validateNatalChartBody({
        timestamp: '2026-02-31T12:00:00.000Z',
        time_certainty: 'exact'
      })
    ).toThrow('timestamp must be a real ISO 8601 UTC instant.');

    expect(
      validateNatalChartBody({
        timestamp: '2024-02-29T12:00:00.000Z',
        time_certainty: 'exact'
      }).timestamp
    ).toBe('2024-02-29T12:00:00.000Z');
  });

  it('requires explicit editorial approval for content backfill', () => {
    expect(() =>
      validateContentBackfillBody({
        daily_days: 14,
        skip_static_content: true
      })
    ).toThrow();

    expect(
      validateContentBackfillBody({
        daily_days: 14,
        skip_static_content: true,
        editorial_status: 'approved',
        approved_by: 'github-actions',
        approval_reference: 'workflow:content-backfill'
      })
    ).toMatchObject({
      editorial_status: 'approved',
      approved_by: 'github-actions',
      approval_reference: 'workflow:content-backfill'
    });
  });

  it('accepts an optional language filter for content backfill so a single-language backfill stays under the Worker subrequest limit', () => {
    expect(
      validateContentBackfillBody({
        daily_days: 1,
        skip_static_content: false,
        language: 'pt',
        editorial_status: 'approved',
        approved_by: 'github-actions',
        approval_reference: 'workflow:content-backfill'
      })
    ).toMatchObject({ language: 'pt' });

    expect(
      validateContentBackfillBody({
        daily_days: 1,
        skip_static_content: false,
        language: 'fr',
        editorial_status: 'approved',
        approved_by: 'github-actions',
        approval_reference: 'workflow:content-backfill'
      })
    ).toMatchObject({ language: 'fr' });

    expect(() =>
      validateContentBackfillBody({
        daily_days: 1,
        skip_static_content: false,
        language: 'it',
        editorial_status: 'approved',
        approved_by: 'github-actions',
        approval_reference: 'workflow:content-backfill'
      })
    ).toThrow();
  });

  it.each(['premium_monthly', 'premium_weekly', 'premium_yearly'])(
    'accepts supported subscription product %s',
    (productId) => {
      expect(
        validateSubscriptionBody({
          purchase_token: 'purchase-token',
          product_id: productId
        })
      ).toEqual({
        purchase_token: 'purchase-token',
        product_id: productId
      });
    }
  );

  it.each(['premium_daily', 'unknown'])(
    'rejects unsupported subscription product %s',
    (productId) => {
      expect(() =>
        validateSubscriptionBody({
          purchase_token: 'purchase-token',
          product_id: productId
        })
      ).toThrow();
    }
  );

  it.each(['credits_small', 'credits_medium', 'credits_large'])(
    'accepts supported credit product %s',
    (productId) => {
      expect(
        validateCreditsVerifyBody({
          purchase_token: 'purchase-token',
          product_id: productId
        })
      ).toEqual({
        purchase_token: 'purchase-token',
        product_id: productId
      });
    }
  );

  it('rejects an unsupported credit product', () => {
    expect(() =>
      validateCreditsVerifyBody({
        purchase_token: 'purchase-token',
        product_id: 'credits_giant'
      })
    ).toThrow();
  });

  it('accepts a valid credit spend request', () => {
    expect(validateCreditsSpendBody({ amount: 10, feature: 'deep_reading' })).toEqual({
      amount: 10,
      feature: 'deep_reading'
    });
  });

  it.each([0, -5, 1001])('rejects an out-of-range credit spend amount %s', (amount) => {
    expect(() => validateCreditsSpendBody({ amount, feature: 'deep_reading' })).toThrow();
  });

  it('accepts supported mobile platforms on register and update payloads', () => {
    expect(
      validateRegisterBody({
        sign: 'aries',
        language: 'tr',
        fcm_token: 'token-1',
        notification_hour: 9,
        utc_offset: 3,
        platform: 'android'
      }).platform
    ).toBe('android');

    expect(
      validateUpdateUserBody({
        platform: 'ios'
      }).platform
    ).toBe('ios');
  });

  it('accepts real daily and weekly reward identifiers', () => {
    expect(isValidRewardIdentifier('daily', '2026-07-26')).toBe(true);
    expect(isValidRewardIdentifier('weekly', '2026-W30')).toBe(true);
    expect(isValidRewardIdentifier('daily', '2024-02-29')).toBe(true);
    expect(
      validateRewardPrepareBody({ reward_type: 'daily', identifier: '2026-07-26' })
    ).toEqual({ reward_type: 'daily', identifier: '2026-07-26' });
  });

  it.each(['2026-02-30', '2026-02-31', '2026-13-01', '2026-00-10', '2023-02-29'])(
    'rejects impossible daily reward identifier %s',
    (identifier) => {
      expect(isValidRewardIdentifier('daily', identifier)).toBe(false);
      expect(() =>
        validateRewardPrepareBody({ reward_type: 'daily', identifier })
      ).toThrow();
    }
  );

  it.each(['2026-W00', '2026-W54', '2026-W99', '2026-07-26'])(
    'rejects invalid weekly reward identifier %s',
    (identifier) => {
      expect(isValidRewardIdentifier('weekly', identifier)).toBe(false);
      expect(() =>
        validateRewardPrepareBody({ reward_type: 'weekly', identifier })
      ).toThrow();
    }
  );
});
