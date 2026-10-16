import { test } from 'vitest';

import { searchCities } from '@/services/cityLookup';
import { buildDocumentsForSeed } from '@/utils/contentSeed';
import { convertLocalWallClockToUtc } from '@/utils/timezone';

test('city lookup', async ({ bench }) => {
  await bench('searchCities exact match', () => {
    searchCities('İstanbul');
  }).run();

  await bench('searchCities substring match', () => {
    searchCities('an');
  }).run();
});

test('timezone', async ({ bench }) => {
  await bench('convertLocalWallClockToUtc', () => {
    convertLocalWallClockToUtc({ isoLocalDateTime: '1990-06-15T14:30:00', tzid: 'America/New_York' });
  }).run();
});

test('content seed', async ({ bench }) => {
  await bench('buildDocumentsForSeed 7 days', () => {
    buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 7 });
  }).run();
});
