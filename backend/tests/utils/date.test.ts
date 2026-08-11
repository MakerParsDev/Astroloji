import { describe, expect, it } from 'vitest';

import { getLocalDateIdentifier, getMonthIdentifier, getWeekIdentifier, shouldSendNotificationAtUtcHour } from '@/utils/date';

describe('date utils', () => {
  it('builds ISO week identifiers', () => {
    expect(getWeekIdentifier(new Date('2026-03-18T12:00:00Z'))).toBe('2026-W12');
  });

  it('builds month identifiers', () => {
    expect(getMonthIdentifier(new Date('2026-03-18T12:00:00Z'))).toBe('2026-03');
  });

  it('resolves the local calendar date across a utc offset boundary', () => {
    expect(getLocalDateIdentifier(3, new Date('2026-08-11T22:00:00Z'))).toBe('2026-08-12');
    expect(getLocalDateIdentifier(-5, new Date('2026-08-11T02:00:00Z'))).toBe('2026-08-10');
  });

  it('matches notification hours across utc offsets', () => {
    expect(shouldSendNotificationAtUtcHour(9, 3, 6)).toBe(true);
    expect(shouldSendNotificationAtUtcHour(9, -5, 14)).toBe(true);
    expect(shouldSendNotificationAtUtcHour(9, 3, 7)).toBe(false);
  });
});
