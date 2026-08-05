import { describe, expect, it } from 'vitest';

import {
  normalizeCompatibilityPair,
  sanitizeNotificationData,
  validateContentBackfillBody,
  validateRegisterBody,
  validateUpdateUserBody,
  validateLanguage,
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
});
