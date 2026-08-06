import { describe, expect, it } from 'vitest';

import {
  calculateMajorAspects,
  createNatalChart,
  type AspectPosition
} from '@/chart-engine/natalChart';

describe('natal chart v1', () => {
  it('detects major aspects using circular separation and bounded orbs', () => {
    const positions: AspectPosition[] = [
      { body: 'sun', longitude: 359 },
      { body: 'moon', longitude: 1 },
      { body: 'mercury', longitude: 61 },
      { body: 'venus', longitude: 89 },
      { body: 'mars', longitude: 181 }
    ];

    expect(calculateMajorAspects(positions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ first: 'sun', second: 'moon', type: 'conjunction', orb: 2 }),
        expect.objectContaining({ first: 'sun', second: 'mercury', type: 'sextile', orb: 2 }),
        expect.objectContaining({ first: 'moon', second: 'venus', type: 'square', orb: 2 }),
        expect.objectContaining({ first: 'moon', second: 'mars', type: 'opposition', orb: 0 })
      ])
    );
  });

  it('builds a traceable chart without inventing houses or an ascendant', () => {
    const chart = createNatalChart({
      timestamp: '2026-08-05T00:00:00.000Z',
      timeCertainty: 'exact'
    });

    expect(chart.version).toBe('natal-chart-v1');
    expect(chart.calculationVersion).toBe('astronomy-engine-2.1.19');
    expect(chart.positions).toHaveLength(10);
    expect(chart.aspects.length).toBeGreaterThan(5);
    expect(chart.ascendant).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.limitations).toContain('houses_and_ascendant_not_calculated');
    expect(chart.limitations).not.toContain('birth_time_uncertain');
  });

  it('marks unknown birth time as uncertain and keeps time-sensitive angles unavailable', () => {
    const chart = createNatalChart({
      timestamp: '2026-08-05T12:00:00.000Z',
      timeCertainty: 'unknown'
    });

    expect(chart.timeCertainty).toBe('unknown');
    expect(chart.ascendant).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.limitations).toContain('birth_time_uncertain');
    expect(chart.limitations).toContain('moon_position_time_sensitive');
  });

  it('rejects non-ISO timestamps', () => {
    expect(() =>
      createNatalChart({
        timestamp: 'August 5 someday',
        timeCertainty: 'exact'
      })
    ).toThrow(/ISO 8601/i);
  });
});
