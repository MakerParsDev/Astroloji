import { describe, expect, it } from 'vitest';

import { ayanamsa, spicaTropicalLongitude, tropicalToSidereal } from '@/chart-engine/vedic/ayanamsa';

describe('ayanamsa (True Chitrapaksha)', () => {
  it('places Spica at exactly 180 degrees sidereal longitude for any date, by definition', () => {
    // Recomputes Spica's tropical longitude independently of ayanamsa()'s
    // own internal value, so this is a real regression check on the
    // subtraction and unit handling, not a tautology.
    const dates = [
      new Date('1900-01-01T00:00:00.000Z'),
      new Date('2000-01-01T12:00:00.000Z'),
      new Date('2026-08-11T00:00:00.000Z'),
      new Date('2100-06-15T18:30:00.000Z')
    ];

    for (const date of dates) {
      const tropical = spicaTropicalLongitude(date);
      const sidereal = tropicalToSidereal(tropical, date);
      expect(sidereal).toBeCloseTo(180, 6);
    }
  });

  it('falls within a few arcminutes of the commonly published Lahiri figure near J2000', () => {
    const value = ayanamsa(new Date('2000-01-01T12:00:00.000Z'));
    // Commonly cited Lahiri ayanamsa at J2000 is approximately 23deg51' (23.85deg).
    expect(Math.abs(value - 23.85)).toBeLessThan(5 / 60);
  });

  it('increases at a rate consistent with general precession (~50.3 arcsec/year)', () => {
    const early = ayanamsa(new Date('1900-01-01T00:00:00.000Z'));
    const late = ayanamsa(new Date('2000-01-01T00:00:00.000Z'));
    const perYear = (late - early) / 100;
    // 50.3 arcsec/year = 50.3/3600 deg/year ~= 0.01397 deg/year.
    expect(perYear).toBeGreaterThan(0.012);
    expect(perYear).toBeLessThan(0.016);
  });

  it('rejects an invalid date', () => {
    expect(() => ayanamsa(new Date('not-a-date'))).toThrow('Invalid date for ayanamsa calculation.');
  });

  it('converts a tropical longitude to sidereal by subtracting the ayanamsa', () => {
    const date = new Date('2026-08-11T00:00:00.000Z');
    const tropical = 100;
    const expectedSidereal = tropical - ayanamsa(date);
    expect(tropicalToSidereal(tropical, date)).toBeCloseTo(
      ((expectedSidereal % 360) + 360) % 360,
      9
    );
  });
});
