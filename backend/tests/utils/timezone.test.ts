import { describe, expect, it } from 'vitest';

import { convertLocalWallClockToUtc, resolveUtcOffsetMinutes } from '@/utils/timezone';

describe('resolveUtcOffsetMinutes', () => {
  it('resolves a fixed year-round offset (Turkey has been UTC+3 with no DST since 2016)', () => {
    expect(resolveUtcOffsetMinutes(new Date('2026-01-10T12:00:00Z'), 'Europe/Istanbul')).toBe(180);
    expect(resolveUtcOffsetMinutes(new Date('2026-07-10T12:00:00Z'), 'Europe/Istanbul')).toBe(180);
  });

  it('resolves a DST-observing zone differently between winter and summer', () => {
    expect(resolveUtcOffsetMinutes(new Date('2026-01-10T12:00:00Z'), 'America/New_York')).toBe(-300); // EST, UTC-5
    expect(resolveUtcOffsetMinutes(new Date('2026-07-10T12:00:00Z'), 'America/New_York')).toBe(-240); // EDT, UTC-4
  });

  it('resolves a half-hour offset (India)', () => {
    expect(resolveUtcOffsetMinutes(new Date('2026-08-10T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });

  it('resolves the world\'s earliest time zone (Kiribati, UTC+14)', () => {
    expect(resolveUtcOffsetMinutes(new Date('2026-08-10T12:00:00Z'), 'Pacific/Kiritimati')).toBe(840);
  });

  it('rejects an unknown time zone identifier', () => {
    expect(() => resolveUtcOffsetMinutes(new Date('2026-08-10T12:00:00Z'), 'Not/A_Real_Zone')).toThrow(/time zone/);
  });

  it('rejects an invalid date', () => {
    expect(() => resolveUtcOffsetMinutes(new Date('not a date'), 'Europe/Istanbul')).toThrow(/date/i);
  });
});

describe('convertLocalWallClockToUtc', () => {
  it('converts a fixed-offset zone (Istanbul, UTC+3) by subtracting the offset', () => {
    const utc = convertLocalWallClockToUtc({ isoLocalDateTime: '2026-08-10T12:00:00', tzid: 'Europe/Istanbul' });

    expect(utc.toISOString()).toBe('2026-08-10T09:00:00.000Z');
  });

  it('converts a negative-offset, DST-observing zone correctly in summer', () => {
    // 14:30 local in New York in July is EDT (UTC-4) -> 18:30 UTC.
    const utc = convertLocalWallClockToUtc({ isoLocalDateTime: '2026-07-10T14:30:00', tzid: 'America/New_York' });

    expect(utc.toISOString()).toBe('2026-07-10T18:30:00.000Z');
  });

  it('converts the same zone correctly in winter, using standard time instead of daylight time', () => {
    // 14:30 local in New York in January is EST (UTC-5) -> 19:30 UTC.
    const utc = convertLocalWallClockToUtc({ isoLocalDateTime: '2026-01-10T14:30:00', tzid: 'America/New_York' });

    expect(utc.toISOString()).toBe('2026-01-10T19:30:00.000Z');
  });

  it('round-trips through resolveUtcOffsetMinutes for a half-hour offset', () => {
    const utc = convertLocalWallClockToUtc({ isoLocalDateTime: '1990-06-15T09:15:00', tzid: 'Asia/Kolkata' });
    const offset = resolveUtcOffsetMinutes(utc, 'Asia/Kolkata');

    // 09:15 IST (UTC+5:30) -> 03:45 UTC.
    expect(utc.toISOString()).toBe('1990-06-15T03:45:00.000Z');
    expect(offset).toBe(330);
  });

  it('rejects input carrying an explicit offset or Z suffix', () => {
    expect(() =>
      convertLocalWallClockToUtc({ isoLocalDateTime: '2026-08-10T12:00:00Z', tzid: 'Europe/Istanbul' })
    ).toThrow(/without a UTC offset/);
    expect(() =>
      convertLocalWallClockToUtc({ isoLocalDateTime: '2026-08-10T12:00:00+03:00', tzid: 'Europe/Istanbul' })
    ).toThrow(/without a UTC offset/);
  });

  it('rejects a malformed date-time string', () => {
    expect(() =>
      convertLocalWallClockToUtc({ isoLocalDateTime: 'not-a-date', tzid: 'Europe/Istanbul' })
    ).toThrow(/without a UTC offset/);
  });
});
