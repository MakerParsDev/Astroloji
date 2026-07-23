import { describe, expect, it } from 'vitest';

import {
  normalizeCompatibilityPair,
  sanitizeNotificationData,
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
