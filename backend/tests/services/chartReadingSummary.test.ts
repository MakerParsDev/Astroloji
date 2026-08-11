import { describe, expect, it } from 'vitest';

import { createNatalChart } from '@/chart-engine/natalChart';
import { buildChartFingerprint, deriveChartReadingSummary } from '@/services/chartReadingSummary';

describe('deriveChartReadingSummary', () => {
  it('extracts sun, moon, venus, and mars placements', () => {
    const chart = createNatalChart({ timestamp: '1990-01-15T12:00:00.000Z', timeCertainty: 'unknown' });

    const summary = deriveChartReadingSummary(chart);

    expect(summary.sunSign).toBeTruthy();
    expect(summary.moonSign).toBeTruthy();
    expect(summary.venusSign).toBeTruthy();
    expect(summary.marsSign).toBeTruthy();
    expect(typeof summary.sunDegree).toBe('number');
  });

  it('leaves the ascendant null when the chart has no observer/exact time', () => {
    const chart = createNatalChart({ timestamp: '1990-01-15T12:00:00.000Z', timeCertainty: 'unknown' });

    const summary = deriveChartReadingSummary(chart);

    expect(summary.ascendantSign).toBeNull();
    expect(summary.ascendantDegree).toBeNull();
  });

  it('includes the ascendant when the chart has an exact time and observer', () => {
    const chart = createNatalChart({
      timestamp: '1990-01-15T12:00:00.000Z',
      timeCertainty: 'exact',
      observer: { latitude: 41, longitude: 29 }
    });

    const summary = deriveChartReadingSummary(chart);

    expect(summary.ascendantSign).toBeTruthy();
    expect(summary.ascendantDegree).not.toBeNull();
  });
});

describe('buildChartFingerprint', () => {
  it('is deterministic for the same birth instant and location', async () => {
    const first = await buildChartFingerprint('1990-01-15T12:00:00.000Z', 41, 29);
    const second = await buildChartFingerprint('1990-01-15T12:00:00.000Z', 41, 29);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('changes when the birth location changes', async () => {
    const original = await buildChartFingerprint('1990-01-15T12:00:00.000Z', 41, 29);
    const moved = await buildChartFingerprint('1990-01-15T12:00:00.000Z', 40, 29);

    expect(moved).not.toBe(original);
  });
});
