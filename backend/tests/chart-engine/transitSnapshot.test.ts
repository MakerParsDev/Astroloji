import { describe, expect, it } from 'vitest';

import { createTransitSnapshot } from '@/chart-engine/transitSnapshot';

describe('transit snapshot v1', () => {
  it('produces exact self-conjunctions when natal and target timestamps match', () => {
    const snapshot = createTransitSnapshot({
      natalTimestamp: '2026-08-05T00:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z'
    });

    expect(snapshot.version).toBe('transit-snapshot-v1');
    expect(snapshot.calculationVersion).toBe('astronomy-engine-2.1.19');
    expect(snapshot.transitPositions).toHaveLength(10);
    for (const body of snapshot.transitPositions.map((item) => item.body)) {
      expect(snapshot.aspects).toContainEqual(
        expect.objectContaining({
          transitBody: body,
          natalBody: body,
          type: 'conjunction',
          orb: 0
        })
      );
    }
  });

  it('sorts cross-chart aspects by tightest orb and limits noise', () => {
    const snapshot = createTransitSnapshot({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z'
    });

    expect(snapshot.aspects.length).toBeGreaterThan(5);
    expect(snapshot.aspects.length).toBeLessThanOrEqual(30);
    expect(snapshot.aspects.map((item) => item.orb)).toEqual(
      [...snapshot.aspects.map((item) => item.orb)].sort((first, second) => first - second)
    );
    expect(snapshot.aspects.every((item) => item.orb <= item.maximumOrb)).toBe(true);
  });

  it('carries birth-time uncertainty forward without inventing angles', () => {
    const snapshot = createTransitSnapshot({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'unknown',
      targetTimestamp: '2026-08-05T00:00:00.000Z'
    });

    expect(snapshot.limitations).toContain('birth_time_uncertain');
    expect(snapshot.limitations).toContain('moon_position_time_sensitive');
    expect(snapshot.limitations).toContain('houses_and_ascendant_not_calculated');
  });

  it('rejects ambiguous target timestamps', () => {
    expect(() =>
      createTransitSnapshot({
        natalTimestamp: '1990-01-15T12:00:00.000Z',
        natalTimeCertainty: 'exact',
        targetTimestamp: '2026-08-05T03:00:00'
      })
    ).toThrow(/ISO 8601/i);
  });
});
