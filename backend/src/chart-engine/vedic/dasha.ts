import { nakshatraPosition } from '@/chart-engine/vedic/nakshatra';

/** Fixed Vimshottari graha order. The cycle always advances in this order, never the nakshatra order. */
export const VIMSHOTTARI_GRAHA_ORDER = [
  'ketu',
  'venus',
  'sun',
  'moon',
  'mars',
  'rahu',
  'jupiter',
  'saturn',
  'mercury'
] as const;

export type VimshottariGraha = (typeof VIMSHOTTARI_GRAHA_ORDER)[number];

/** Fixed mahadasha lengths in years. Sums to exactly 120, the traditional Vimshottari cycle length. */
export const VIMSHOTTARI_GRAHA_YEARS: Record<VimshottariGraha, number> = {
  ketu: 7,
  venus: 20,
  sun: 6,
  moon: 10,
  mars: 7,
  rahu: 18,
  jupiter: 16,
  saturn: 19,
  mercury: 17
};

export const VIMSHOTTARI_CYCLE_YEARS = VIMSHOTTARI_GRAHA_ORDER.reduce(
  (total, graha) => total + VIMSHOTTARI_GRAHA_YEARS[graha],
  0
);

/** One Julian year, the fixed year-length convention this module uses for dasha arithmetic. See ADR-0003. */
export const JULIAN_YEAR_DAYS = 365.25;

/** The 27 nakshatras' ruling grahas: the fixed graha order repeated three times. */
export function nakshatraLord(nakshatraIndex: number): VimshottariGraha {
  return VIMSHOTTARI_GRAHA_ORDER[nakshatraIndex % VIMSHOTTARI_GRAHA_ORDER.length];
}

export type Mahadasha = {
  graha: VimshottariGraha;
  startDate: Date;
  endDate: Date;
  years: number;
};

/**
 * Computes the sequence of Vimshottari mahadashas from birth: the birth
 * nakshatra lord's remaining balance, then the following `periodCount - 1`
 * grahas in the fixed Vimshottari order, each running their full period.
 * This is the standard "life overview" presentation used by Vedic
 * astrology software (9 periods by default) rather than a closed 120-year
 * cycle, which would require a final partial period back at the birth
 * lord — see ADR-0003's validation section for the closure check that
 * proves this arithmetic is still correct.
 */
export function calculateVimshottariMahadashas(
  moonSiderealLongitude: number,
  birthDate: Date,
  periodCount: number = VIMSHOTTARI_GRAHA_ORDER.length
): Mahadasha[] {
  if (Number.isNaN(birthDate.getTime())) {
    throw new Error('Invalid birth date for Vimshottari dasha calculation.');
  }
  if (!Number.isInteger(periodCount) || periodCount < 1) {
    throw new Error('periodCount must be a positive integer.');
  }

  const position = nakshatraPosition(moonSiderealLongitude);
  const birthLord = nakshatraLord(position.index);
  const birthLordOrderIndex = VIMSHOTTARI_GRAHA_ORDER.indexOf(birthLord);

  const periods: Mahadasha[] = [];
  let cursor = birthDate;

  for (let periodIndex = 0; periodIndex < periodCount; periodIndex += 1) {
    const graha = VIMSHOTTARI_GRAHA_ORDER[(birthLordOrderIndex + periodIndex) % VIMSHOTTARI_GRAHA_ORDER.length];
    const fullYears = VIMSHOTTARI_GRAHA_YEARS[graha];
    const years = periodIndex === 0 ? (1 - position.fractionElapsed) * fullYears : fullYears;
    const durationMs = years * JULIAN_YEAR_DAYS * 24 * 60 * 60 * 1000;
    const startDate = cursor;
    const endDate = new Date(startDate.getTime() + durationMs);

    periods.push({ graha, startDate, endDate, years });
    cursor = endDate;
  }

  return periods;
}
