import { describe, expect, it } from 'vitest';

import { getMonthIdentifier, getWeekIdentifier, shouldSendNotificationAtUtcHour } from '@/utils/date';

describe('date utils', () => {
  it('builds ISO week identifiers', () => {
    expect(getWeekIdentifier(new Date('2026-03-18T12:00:00Z'))).toBe('2026-W12');
  });

  it('builds month identifiers', () => {
    expect(getMonthIdentifier(new Date('2026-03-18T12:00:00Z'))).toBe('2026-03');
  });

  it('matches notification hours across utc offsets', () => {
    expect(shouldSendNotificationAtUtcHour(9, 3, 6)).toBe(true);
    expect(shouldSendNotificationAtUtcHour(9, -5, 14)).toBe(true);
    expect(shouldSendNotificationAtUtcHour(9, 3, 7)).toBe(false);
  });
});
