import { describe, expect, it } from 'vitest';

import { NAKSHATRAS, NAKSHATRA_SPAN_DEGREES } from '@/chart-engine/vedic/nakshatra';
import {
  JULIAN_YEAR_DAYS,
  VIMSHOTTARI_CYCLE_YEARS,
  VIMSHOTTARI_GRAHA_ORDER,
  VIMSHOTTARI_GRAHA_YEARS,
  calculateVimshottariMahadashas,
  nakshatraLord
} from '@/chart-engine/vedic/dasha';

const BIRTH_DATE = new Date('2026-08-11T00:00:00.000Z');

describe('Vimshottari dasha', () => {
  it('defines nine graha periods summing to exactly 120 years', () => {
    expect(VIMSHOTTARI_GRAHA_ORDER).toHaveLength(9);
    expect(VIMSHOTTARI_CYCLE_YEARS).toBe(120);
    const sum = VIMSHOTTARI_GRAHA_ORDER.reduce((total, graha) => total + VIMSHOTTARI_GRAHA_YEARS[graha], 0);
    expect(sum).toBe(120);
  });

  it('assigns nakshatra lords using the fixed graha order repeated three times across all 27 nakshatras', () => {
    for (let index = 0; index < NAKSHATRAS.length; index += 1) {
      expect(nakshatraLord(index)).toBe(VIMSHOTTARI_GRAHA_ORDER[index % 9]);
    }
    // Explicit spot checks against the well-known table, independent of the modulo logic above.
    expect(nakshatraLord(0)).toBe('ketu'); // Ashwini
    expect(nakshatraLord(3)).toBe('moon'); // Rohini
    expect(nakshatraLord(8)).toBe('mercury'); // Ashlesha
    expect(nakshatraLord(9)).toBe('ketu'); // Magha (cycle repeats)
    expect(nakshatraLord(26)).toBe('mercury'); // Revati
  });

  it('gives the full graha period as the balance when birth falls exactly at the start of a nakshatra', () => {
    // 3 * span = start of Rohini (index 3), ruled by Moon.
    const moonLongitude = 3 * NAKSHATRA_SPAN_DEGREES;
    const [first] = calculateVimshottariMahadashas(moonLongitude, BIRTH_DATE, 1);
    expect(first.graha).toBe('moon');
    expect(first.years).toBeCloseTo(VIMSHOTTARI_GRAHA_YEARS.moon, 9);
  });

  it('gives a near-zero balance when birth falls just before the end of a nakshatra', () => {
    const moonLongitude = 4 * NAKSHATRA_SPAN_DEGREES - 1e-6;
    const [first] = calculateVimshottariMahadashas(moonLongitude, BIRTH_DATE, 1);
    expect(first.graha).toBe('moon');
    expect(first.years).toBeGreaterThan(0);
    expect(first.years).toBeLessThan(1e-6);
  });

  it('gives exactly half the full period as the balance at the midpoint of a nakshatra', () => {
    const moonLongitude = 3 * NAKSHATRA_SPAN_DEGREES + NAKSHATRA_SPAN_DEGREES / 2;
    const [first] = calculateVimshottariMahadashas(moonLongitude, BIRTH_DATE, 1);
    expect(first.graha).toBe('moon');
    expect(first.years).toBeCloseTo(VIMSHOTTARI_GRAHA_YEARS.moon / 2, 9);
  });

  it('runs subsequent periods at full length in the fixed graha order, not the nakshatra order', () => {
    const moonLongitude = 3 * NAKSHATRA_SPAN_DEGREES; // start of Rohini, lord = moon
    const periods = calculateVimshottariMahadashas(moonLongitude, BIRTH_DATE, 9);

    expect(periods.map((period) => period.graha)).toEqual([
      'moon',
      'mars',
      'rahu',
      'jupiter',
      'saturn',
      'mercury',
      'ketu',
      'venus',
      'sun'
    ]);
    for (let index = 1; index < periods.length; index += 1) {
      expect(periods[index].years).toBeCloseTo(VIMSHOTTARI_GRAHA_YEARS[periods[index].graha], 9);
    }
  });

  it('chains periods back to back with no gaps or overlaps', () => {
    const periods = calculateVimshottariMahadashas(50, BIRTH_DATE, 9);
    for (let index = 1; index < periods.length; index += 1) {
      expect(periods[index].startDate.getTime()).toBe(periods[index - 1].endDate.getTime());
    }
  });

  it('sums the nine-period sequence to 120 years minus the elapsed portion of the birth lord, using the Julian year convention', () => {
    const moonLongitude = 3 * NAKSHATRA_SPAN_DEGREES + NAKSHATRA_SPAN_DEGREES / 2; // midpoint of Rohini (moon)
    const periods = calculateVimshottariMahadashas(moonLongitude, BIRTH_DATE, 9);

    const totalMs = periods[periods.length - 1].endDate.getTime() - periods[0].startDate.getTime();
    const totalYears = totalMs / (JULIAN_YEAR_DAYS * 24 * 60 * 60 * 1000);
    const elapsedYearsOfBirthLord = 0.5 * VIMSHOTTARI_GRAHA_YEARS.moon;
    expect(totalYears).toBeCloseTo(120 - elapsedYearsOfBirthLord, 6);
  });

  it('closes back to exactly a 120-year cycle when the birth lord is revisited to complete its elapsed portion', () => {
    // First 9 periods cover 120 - elapsedYears(birthLord). A 10th period of
    // just the *elapsed* portion (not another full period) closes the loop
    // back to the same relative point in the birth lord's period, for a
    // total of exactly 120 years -- an independent arithmetic identity,
    // not a re-assertion of the implementation's own output.
    const moonLongitude = 3 * NAKSHATRA_SPAN_DEGREES + NAKSHATRA_SPAN_DEGREES * 0.25; // 25% into Rohini
    const periods = calculateVimshottariMahadashas(moonLongitude, BIRTH_DATE, 9);
    const totalMs = periods[periods.length - 1].endDate.getTime() - periods[0].startDate.getTime();
    const totalYears = totalMs / (JULIAN_YEAR_DAYS * 24 * 60 * 60 * 1000);

    const elapsedYearsOfBirthLord = 0.25 * VIMSHOTTARI_GRAHA_YEARS.moon;
    expect(totalYears + elapsedYearsOfBirthLord).toBeCloseTo(120, 6);
  });

  it('rejects an invalid birth date', () => {
    expect(() => calculateVimshottariMahadashas(0, new Date('not-a-date'))).toThrow(
      'Invalid birth date for Vimshottari dasha calculation.'
    );
  });

  it('rejects a non-positive or non-integer period count', () => {
    expect(() => calculateVimshottariMahadashas(0, BIRTH_DATE, 0)).toThrow(
      'periodCount must be a positive integer.'
    );
    expect(() => calculateVimshottariMahadashas(0, BIRTH_DATE, 1.5)).toThrow(
      'periodCount must be a positive integer.'
    );
  });
});
