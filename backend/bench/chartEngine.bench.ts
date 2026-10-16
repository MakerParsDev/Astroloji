import { test } from 'vitest';

import { calculateChartAngles, calculateWholeSignHouses } from '@/chart-engine/houses';
import { calculateMajorAspects, createNatalChart } from '@/chart-engine/natalChart';
import { createPersonalGuidance } from '@/chart-engine/personalGuidance';
import { calculateGeocentricEclipticPositions } from '@/chart-engine/planetaryPositions';
import { createTransitSnapshot } from '@/chart-engine/transitSnapshot';
import { createVedicChart } from '@/chart-engine/vedic/vedicChart';

const NATAL_TIMESTAMP = '1990-01-15T12:00:00.000Z';
const TARGET_TIMESTAMP = '2026-08-05T00:00:00.000Z';
const NATAL_DATE = new Date(NATAL_TIMESTAMP);
const ISTANBUL = { latitude: 41.0082, longitude: 28.9784 };
const PRECOMPUTED_POSITIONS = calculateGeocentricEclipticPositions(NATAL_DATE);

test('planetary positions', async ({ bench }) => {
  await bench('calculateGeocentricEclipticPositions', () => {
    calculateGeocentricEclipticPositions(NATAL_DATE);
  }).run();

  await bench('calculateMajorAspects', () => {
    calculateMajorAspects(PRECOMPUTED_POSITIONS);
  }).run();

  await bench('calculateChartAngles + whole sign houses', () => {
    const angles = calculateChartAngles(NATAL_DATE, ISTANBUL);
    calculateWholeSignHouses(angles.ascendant.longitude);
  }).run();
});

test('natal chart', async ({ bench }) => {
  await bench('createNatalChart without location', () => {
    createNatalChart({ timestamp: NATAL_TIMESTAMP, timeCertainty: 'approximate' });
  }).run();

  await bench('createNatalChart with location', () => {
    createNatalChart({ timestamp: NATAL_TIMESTAMP, timeCertainty: 'exact', observer: ISTANBUL });
  }).run();

  await bench('createVedicChart', () => {
    createVedicChart({ timestamp: NATAL_TIMESTAMP, timeCertainty: 'exact' });
  }).run();
});

test('transits', async ({ bench }) => {
  await bench('createTransitSnapshot', () => {
    createTransitSnapshot({
      natalTimestamp: NATAL_TIMESTAMP,
      natalTimeCertainty: 'exact',
      targetTimestamp: TARGET_TIMESTAMP
    });
  }).run();

  await bench('createPersonalGuidance', () => {
    createPersonalGuidance({
      natalTimestamp: NATAL_TIMESTAMP,
      natalTimeCertainty: 'exact',
      targetTimestamp: TARGET_TIMESTAMP,
      language: 'en'
    });
  }).run();
});
