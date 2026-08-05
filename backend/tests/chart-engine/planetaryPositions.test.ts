import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  calculateGeocentricEclipticPositions,
  normalizeLongitude,
  zodiacPosition
} from '@/chart-engine/planetaryPositions';

type HorizonsFixture = {
  timestamp: string;
  positions: Array<{
    body: string;
    longitude: number;
    latitude: number;
  }>;
};

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/jpl-horizons-geocentric-ecliptic-2026-08-05.json', import.meta.url),
    'utf8'
  )
) as HorizonsFixture;

function angularDistance(first: number, second: number): number {
  const distance = Math.abs(normalizeLongitude(first) - normalizeLongitude(second));
  return Math.min(distance, 360 - distance);
}

describe('planetary positions', () => {
  it('matches recorded JPL apparent geocentric ecliptic positions within one arcminute', () => {
    const actual = calculateGeocentricEclipticPositions(new Date(fixture.timestamp));

    expect(actual).toHaveLength(fixture.positions.length);
    for (const expected of fixture.positions) {
      const position = actual.find((item) => item.body === expected.body);
      expect(position, `missing ${expected.body}`).toBeDefined();
      expect(angularDistance(position!.longitude, expected.longitude)).toBeLessThan(1 / 60);
      expect(Math.abs(position!.latitude - expected.latitude)).toBeLessThan(1 / 60);
    }
  });

  it('maps tropical longitude to a normalized zodiac sign and degree', () => {
    expect(zodiacPosition(0)).toEqual({ sign: 'aries', degree: 0 });
    expect(zodiacPosition(29.999)).toEqual({ sign: 'aries', degree: 29.999 });
    expect(zodiacPosition(30)).toEqual({ sign: 'taurus', degree: 0 });
    expect(zodiacPosition(132.6164949)).toEqual({ sign: 'leo', degree: 12.6164949 });
    expect(zodiacPosition(360)).toEqual({ sign: 'aries', degree: 0 });
    expect(zodiacPosition(-1)).toEqual({ sign: 'pisces', degree: 29 });
  });

  it('rejects invalid timestamps rather than emitting misleading positions', () => {
    expect(() => calculateGeocentricEclipticPositions(new Date('invalid'))).toThrow(/invalid date/i);
  });
});
