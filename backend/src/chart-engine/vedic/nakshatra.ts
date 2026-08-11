import { normalizeLongitude } from '@/chart-engine/planetaryPositions';

export const NAKSHATRAS = [
  'ashwini',
  'bharani',
  'krittika',
  'rohini',
  'mrigashira',
  'ardra',
  'punarvasu',
  'pushya',
  'ashlesha',
  'magha',
  'purva_phalguni',
  'uttara_phalguni',
  'hasta',
  'chitra',
  'swati',
  'vishakha',
  'anuradha',
  'jyeshtha',
  'mula',
  'purva_ashadha',
  'uttara_ashadha',
  'shravana',
  'dhanishta',
  'shatabhisha',
  'purva_bhadrapada',
  'uttara_bhadrapada',
  'revati'
] as const;

export type Nakshatra = (typeof NAKSHATRAS)[number];

export const NAKSHATRA_SPAN_DEGREES = 360 / NAKSHATRAS.length;
export const PADA_SPAN_DEGREES = NAKSHATRA_SPAN_DEGREES / 4;

export type NakshatraPosition = {
  nakshatra: Nakshatra;
  index: number;
  pada: 1 | 2 | 3 | 4;
  /** Degrees elapsed within this nakshatra, in [0, NAKSHATRA_SPAN_DEGREES). */
  degreeWithinNakshatra: number;
  /** Fraction of this nakshatra already traversed, in [0, 1). */
  fractionElapsed: number;
};

// Guards against floating-point round-trip noise (e.g. from the modulo
// arithmetic in normalizeLongitude) nudging a value that is meant to sit
// exactly on a nakshatra/pada boundary a hair below it, which would floor
// into the wrong bucket. 360deg/27 and its quarter are irrational-looking
// repeating binary fractions in IEEE754, so exact boundaries are common in
// tests (and in real longitudes that happen to land near one) even though
// they are not bit-exact after a normalize() round trip.
const BOUNDARY_EPSILON_DEGREES = 1e-9;

export function nakshatraPosition(siderealLongitude: number): NakshatraPosition {
  const normalized = normalizeLongitude(siderealLongitude);
  const index = Math.min(
    NAKSHATRAS.length - 1,
    Math.floor(normalized / NAKSHATRA_SPAN_DEGREES + BOUNDARY_EPSILON_DEGREES)
  );
  const degreeWithinNakshatra = normalized - index * NAKSHATRA_SPAN_DEGREES;
  const pada = (Math.min(
    3,
    Math.floor(degreeWithinNakshatra / PADA_SPAN_DEGREES + BOUNDARY_EPSILON_DEGREES)
  ) + 1) as 1 | 2 | 3 | 4;

  return {
    nakshatra: NAKSHATRAS[index],
    index,
    pada,
    degreeWithinNakshatra,
    fractionElapsed: degreeWithinNakshatra / NAKSHATRA_SPAN_DEGREES
  };
}
