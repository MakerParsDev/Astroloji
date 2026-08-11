import type { NatalChartV1 } from '@/chart-engine/natalChart';
import type { DeepReadingChartSummary } from '@/llm/deepReadingGenerator';

/**
 * Reduces a full natal chart down to the placements a deep reading or chat
 * consultation prompt actually needs. Sun/Moon/Venus/Mars are always present
 * (calculateGeocentricEclipticPositions computes every CHART_BODIES entry
 * unconditionally); the guard below is a safety net against a future chart-
 * engine change, not an expected runtime path.
 */
export function deriveChartReadingSummary(chart: NatalChartV1): DeepReadingChartSummary {
  const sun = chart.positions.find((position) => position.body === 'sun');
  const moon = chart.positions.find((position) => position.body === 'moon');
  const venus = chart.positions.find((position) => position.body === 'venus');
  const mars = chart.positions.find((position) => position.body === 'mars');
  if (!sun || !moon || !venus || !mars) {
    throw new Error('Natal chart is missing a required body for a reading summary.');
  }

  return {
    sunSign: sun.zodiac.sign,
    sunDegree: sun.zodiac.degree,
    moonSign: moon.zodiac.sign,
    moonDegree: moon.zodiac.degree,
    ascendantSign: chart.ascendant?.zodiac.sign ?? null,
    ascendantDegree: chart.ascendant?.zodiac.degree ?? null,
    venusSign: venus.zodiac.sign,
    venusDegree: venus.zodiac.degree,
    marsSign: mars.zodiac.sign,
    marsDegree: mars.zodiac.degree
  };
}

/**
 * Deterministic fingerprint of the birth instant + location, which together
 * fully determine the natal chart. Used as a storage/cache key component so
 * that saving a corrected birth profile naturally invalidates any reading
 * generated from the old one, without needing an explicit cache-bust step.
 */
export async function buildChartFingerprint(
  birthTimestamp: string,
  latitude: number,
  longitude: number
): Promise<string> {
  const payload = new TextEncoder().encode(`${birthTimestamp}|${latitude}|${longitude}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
