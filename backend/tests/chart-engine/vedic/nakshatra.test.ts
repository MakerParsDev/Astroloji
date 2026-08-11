import { describe, expect, it } from 'vitest';

import {
  NAKSHATRAS,
  NAKSHATRA_SPAN_DEGREES,
  PADA_SPAN_DEGREES,
  nakshatraPosition
} from '@/chart-engine/vedic/nakshatra';

describe('nakshatra', () => {
  it('defines 27 nakshatras spanning exactly 13d20m each', () => {
    expect(NAKSHATRAS).toHaveLength(27);
    expect(NAKSHATRA_SPAN_DEGREES).toBeCloseTo(13 + 20 / 60, 9);
    expect(PADA_SPAN_DEGREES).toBeCloseTo((13 + 20 / 60) / 4, 9);
  });

  it('places 0 degrees sidereal exactly at the start of Ashwini', () => {
    const position = nakshatraPosition(0);
    expect(position.nakshatra).toBe('ashwini');
    expect(position.index).toBe(0);
    expect(position.pada).toBe(1);
    expect(position.degreeWithinNakshatra).toBeCloseTo(0, 9);
    expect(position.fractionElapsed).toBeCloseTo(0, 9);
  });

  it('places every nakshatra boundary exactly, including the 360-degree wrap', () => {
    for (let index = 0; index < NAKSHATRAS.length; index += 1) {
      const boundaryLongitude = index * NAKSHATRA_SPAN_DEGREES;
      const position = nakshatraPosition(boundaryLongitude);
      expect(position.nakshatra).toBe(NAKSHATRAS[index]);
      expect(position.index).toBe(index);
      expect(position.pada).toBe(1);
    }

    const wrapped = nakshatraPosition(360);
    expect(wrapped.nakshatra).toBe('ashwini');
  });

  it('places every pada boundary within a nakshatra exactly', () => {
    // Chitra (index 13) starts at 13 * 13d20m = 173d20m.
    const chitraStart = 13 * NAKSHATRA_SPAN_DEGREES;
    expect(nakshatraPosition(chitraStart).pada).toBe(1);
    expect(nakshatraPosition(chitraStart + PADA_SPAN_DEGREES).pada).toBe(2);
    expect(nakshatraPosition(chitraStart + 2 * PADA_SPAN_DEGREES).pada).toBe(3);
    expect(nakshatraPosition(chitraStart + 3 * PADA_SPAN_DEGREES).pada).toBe(4);
    // Just before the next pada boundary must still be the prior pada.
    expect(nakshatraPosition(chitraStart + PADA_SPAN_DEGREES - 1e-6).pada).toBe(1);
  });

  it('places Revati (the last nakshatra) just before the wrap back to Ashwini', () => {
    const revatiStart = 26 * NAKSHATRA_SPAN_DEGREES;
    const justBeforeWrap = nakshatraPosition(360 - 1e-6);
    expect(justBeforeWrap.nakshatra).toBe('revati');
    expect(justBeforeWrap.index).toBe(26);
    expect(justBeforeWrap.pada).toBe(4);
    expect(nakshatraPosition(revatiStart).nakshatra).toBe('revati');
  });

  it('reports the fraction elapsed within the nakshatra', () => {
    const start = 5 * NAKSHATRA_SPAN_DEGREES;
    const halfway = nakshatraPosition(start + NAKSHATRA_SPAN_DEGREES / 2);
    expect(halfway.fractionElapsed).toBeCloseTo(0.5, 9);
  });
});
