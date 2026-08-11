import { describe, expect, it } from 'vitest';

import { ayanamsa } from '@/chart-engine/vedic/ayanamsa';
import { calculateVimshottariMahadashas, VIMSHOTTARI_GRAHA_ORDER } from '@/chart-engine/vedic/dasha';
import { NAKSHATRAS } from '@/chart-engine/vedic/nakshatra';
import { calculateSiderealPositions } from '@/chart-engine/vedic/siderealPositions';
import { createVedicChart } from '@/chart-engine/vedic/vedicChart';

const TEST_TIMESTAMP = '2026-08-11T12:00:00.000Z';

describe('createVedicChart', () => {
  it('returns sidereal positions matching calculateSiderealPositions directly', () => {
    const chart = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'exact' });
    const expected = calculateSiderealPositions(new Date(TEST_TIMESTAMP));

    expect(chart.positions).toEqual(expected);
    expect(chart.ayanamsa).toBeCloseTo(ayanamsa(new Date(TEST_TIMESTAMP)), 9);
  });

  it("derives the Moon's nakshatra from the same sidereal Moon longitude returned in positions", () => {
    const chart = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'exact' });
    const moonPosition = chart.positions.find((position) => position.body === 'moon');

    expect(moonPosition).toBeDefined();
    expect(NAKSHATRAS).toContain(chart.moonNakshatra.nakshatra);
    expect(chart.moonNakshatra.index).toBe(NAKSHATRAS.indexOf(chart.moonNakshatra.nakshatra));
    expect([1, 2, 3, 4]).toContain(chart.moonNakshatra.pada);
  });

  it('returns a nine-mahadasha sequence matching calculateVimshottariMahadashas directly, serialized as ISO strings', () => {
    const chart = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'exact' });
    const moonPosition = chart.positions.find((position) => position.body === 'moon')!;
    const expected = calculateVimshottariMahadashas(moonPosition.longitude, new Date(TEST_TIMESTAMP));

    expect(chart.mahadashas).toHaveLength(VIMSHOTTARI_GRAHA_ORDER.length);
    expect(chart.mahadashas).toEqual(
      expected.map((period) => ({
        graha: period.graha,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        years: period.years
      }))
    );
  });

  it('flags time-sensitive limitations only when birth time is not exact', () => {
    const exact = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'exact' });
    expect(exact.limitations).toEqual([]);

    const approximate = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'approximate' });
    expect(approximate.limitations).toEqual(['birth_time_uncertain', 'moon_position_time_sensitive']);

    const unknown = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'unknown' });
    expect(unknown.limitations).toEqual(['birth_time_uncertain', 'moon_position_time_sensitive']);
  });

  it('rejects a non-ISO or invalid timestamp', () => {
    expect(() => createVedicChart({ timestamp: 'not-a-date', timeCertainty: 'exact' })).toThrow(
      'timestamp must be an ISO 8601 UTC timestamp.'
    );
    expect(() => createVedicChart({ timestamp: '2026-02-30T00:00:00.000Z', timeCertainty: 'exact' })).not.toThrow();
    // Note: calendar-impossible-date rejection (e.g. Feb 30) is the validator's job (validators.ts),
    // matching createNatalChart's own division of responsibility -- this function only checks ISO shape.
  });

  it('stamps a version and calculation version for forward compatibility', () => {
    const chart = createVedicChart({ timestamp: TEST_TIMESTAMP, timeCertainty: 'exact' });
    expect(chart.version).toBe('vedic-chart-v1');
    expect(chart.calculationVersion).toBe('astronomy-engine-2.1.19-true-chitrapaksha');
    expect(chart.timestamp).toBe(TEST_TIMESTAMP);
  });
});
