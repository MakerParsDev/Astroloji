import type { ChartBody } from '@/chart-engine/planetaryPositions';
import { calculateGeocentricEclipticPositions, normalizeLongitude } from '@/chart-engine/planetaryPositions';
import { ayanamsa } from '@/chart-engine/vedic/ayanamsa';

export const SIDEREAL_ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
] as const;

export type SiderealZodiacSign = (typeof SIDEREAL_ZODIAC_SIGNS)[number];

export type SiderealZodiacPosition = {
  sign: SiderealZodiacSign;
  degree: number;
};

export type SiderealPosition = {
  body: ChartBody;
  longitude: number;
  latitude: number;
  zodiac: SiderealZodiacPosition;
};

export function siderealZodiacPosition(siderealLongitude: number): SiderealZodiacPosition {
  const normalized = normalizeLongitude(siderealLongitude);
  const index = Math.floor(normalized / 30);
  return {
    sign: SIDEREAL_ZODIAC_SIGNS[index],
    degree: Math.round((normalized - index * 30) * 1_000_000_000) / 1_000_000_000
  };
}

export function calculateSiderealPositions(date: Date): SiderealPosition[] {
  const tropicalPositions = calculateGeocentricEclipticPositions(date);
  const ayanamsaValue = ayanamsa(date);

  return tropicalPositions.map((position) => {
    const siderealLongitude = normalizeLongitude(position.longitude - ayanamsaValue);
    return {
      body: position.body,
      longitude: siderealLongitude,
      latitude: position.latitude,
      zodiac: siderealZodiacPosition(siderealLongitude)
    };
  });
}
