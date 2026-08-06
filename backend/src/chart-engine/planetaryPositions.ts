import { Body, Ecliptic, GeoVector } from 'astronomy-engine';

export const TROPICAL_ZODIAC_SIGNS = [
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

export type TropicalZodiacSign = (typeof TROPICAL_ZODIAC_SIGNS)[number];

export const CHART_BODIES = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto'
] as const;

export type ChartBody = (typeof CHART_BODIES)[number];

export type ZodiacPosition = {
  sign: TropicalZodiacSign;
  degree: number;
};

export type GeocentricEclipticPosition = {
  body: ChartBody;
  longitude: number;
  latitude: number;
  zodiac: ZodiacPosition;
};

const ASTRONOMY_BODIES: Record<ChartBody, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto
};

export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) {
    throw new Error('Longitude must be finite.');
  }
  return ((longitude % 360) + 360) % 360;
}

export function zodiacPosition(longitude: number): ZodiacPosition {
  const normalized = normalizeLongitude(longitude);
  const index = Math.floor(normalized / 30);
  return {
    sign: TROPICAL_ZODIAC_SIGNS[index],
    degree: Math.round((normalized - index * 30) * 1_000_000_000) / 1_000_000_000
  };
}

export function calculateGeocentricEclipticPositions(
  date: Date
): GeocentricEclipticPosition[] {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for planetary position calculation.');
  }

  return CHART_BODIES.map((body) => {
    const vector = GeoVector(ASTRONOMY_BODIES[body], date, true);
    const ecliptic = Ecliptic(vector);
    const longitude = normalizeLongitude(ecliptic.elon);

    return {
      body,
      longitude,
      latitude: ecliptic.elat,
      zodiac: zodiacPosition(longitude)
    };
  });
}
