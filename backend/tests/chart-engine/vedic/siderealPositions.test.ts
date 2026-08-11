import { describe, expect, it } from 'vitest';

import { calculateGeocentricEclipticPositions, normalizeLongitude } from '@/chart-engine/planetaryPositions';
import { ayanamsa } from '@/chart-engine/vedic/ayanamsa';
import { calculateSiderealPositions, siderealZodiacPosition } from '@/chart-engine/vedic/siderealPositions';

const TEST_DATE = new Date('2026-08-11T00:00:00.000Z');

describe('sidereal positions', () => {
  it('subtracts the ayanamsa from each tropical longitude', () => {
    const tropical = calculateGeocentricEclipticPositions(TEST_DATE);
    const sidereal = calculateSiderealPositions(TEST_DATE);
    const ayanamsaValue = ayanamsa(TEST_DATE);

    expect(sidereal).toHaveLength(tropical.length);
    for (const tropicalPosition of tropical) {
      const siderealPosition = sidereal.find((item) => item.body === tropicalPosition.body);
      expect(siderealPosition).toBeDefined();
      const expected = normalizeLongitude(tropicalPosition.longitude - ayanamsaValue);
      expect(siderealPosition!.longitude).toBeCloseTo(expected, 9);
      expect(siderealPosition!.latitude).toBe(tropicalPosition.latitude);
    }
  });

  it('maps sidereal longitude to a normalized zodiac sign and degree', () => {
    expect(siderealZodiacPosition(0)).toEqual({ sign: 'aries', degree: 0 });
    expect(siderealZodiacPosition(29.999)).toEqual({ sign: 'aries', degree: 29.999 });
    expect(siderealZodiacPosition(30)).toEqual({ sign: 'taurus', degree: 0 });
    expect(siderealZodiacPosition(360)).toEqual({ sign: 'aries', degree: 0 });
    expect(siderealZodiacPosition(-1)).toEqual({ sign: 'pisces', degree: 29 });
  });

  it('places each sidereal longitude noticeably earlier in the zodiac than the tropical one, by roughly the ayanamsa', () => {
    const tropical = calculateGeocentricEclipticPositions(TEST_DATE);
    const sidereal = calculateSiderealPositions(TEST_DATE);
    const ayanamsaValue = ayanamsa(TEST_DATE);

    for (const tropicalPosition of tropical) {
      const siderealPosition = sidereal.find((item) => item.body === tropicalPosition.body)!;
      const diff = normalizeLongitude(tropicalPosition.longitude - siderealPosition.longitude);
      expect(diff).toBeCloseTo(ayanamsaValue, 6);
    }
  });
});
