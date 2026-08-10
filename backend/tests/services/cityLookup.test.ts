import { describe, expect, it } from 'vitest';

import { getCityById, searchCities } from '@/services/cityLookup';

describe('searchCities', () => {
  it('finds an exact-name match', () => {
    const results = searchCities('Istanbul');

    expect(results[0]).toMatchObject({ id: 'istanbul-tr', name: 'Istanbul', tzid: 'Europe/Istanbul' });
  });

  it('is case-insensitive', () => {
    expect(searchCities('istanbul')[0]?.id).toBe('istanbul-tr');
    expect(searchCities('ISTANBUL')[0]?.id).toBe('istanbul-tr');
  });

  it('is diacritic-insensitive in both the query and the stored name', () => {
    // "İstanbul" (Turkish dotted capital İ) as a query should still match the plain "Istanbul" row.
    expect(searchCities('İstanbul')[0]?.id).toBe('istanbul-tr');
    // "Sao Paulo" (no diacritics) as a query should match the stored "São Paulo".
    expect(searchCities('Sao Paulo')[0]?.id).toBe('sao-paulo-br');
  });

  it('ranks a name-prefix match above a substring-elsewhere match', () => {
    const results = searchCities('man');

    const manchesterIndex = results.findIndex((city) => city.id === 'manchester-gb');
    const germanyCityIndex = results.findIndex((city) => city.country === 'Germany');
    expect(manchesterIndex).toBeGreaterThanOrEqual(0);
    if (germanyCityIndex >= 0) {
      expect(manchesterIndex).toBeLessThan(germanyCityIndex);
    }
  });

  it('matches on country name too', () => {
    const results = searchCities('Turkey');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((city) => city.country === 'Turkey')).toBe(true);
  });

  it('returns an empty array for a query shorter than the minimum length', () => {
    expect(searchCities('i')).toEqual([]);
    expect(searchCities('')).toEqual([]);
  });

  it('returns no results for a query that matches nothing', () => {
    expect(searchCities('Not A Real City Name Xyz')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    // "an" appears in many city and country names (Manchester, Shanghai, Bangkok, Japan, France, ...).
    const unlimited = searchCities('an', 100);
    expect(unlimited.length).toBeGreaterThan(3);

    const limited = searchCities('an', 3);
    expect(limited).toHaveLength(3);
    expect(limited).toEqual(unlimited.slice(0, 3));
  });

  it('is deterministic across repeated calls with the same query', () => {
    const first = searchCities('an', 100);
    const second = searchCities('an', 100);

    expect(first.map((city) => city.id)).toEqual(second.map((city) => city.id));
  });

  it('orders prefix matches before substring matches, and sorts alphabetically within each group', () => {
    const results = searchCities('an', 100);
    const names = results.map((city) => city.name);
    const prefixNames = names.filter((name) => name.toLowerCase().startsWith('an'));
    const substringNames = names.filter((name) => !name.toLowerCase().startsWith('an'));

    expect(prefixNames.length).toBeGreaterThan(0);
    expect(substringNames.length).toBeGreaterThan(0);
    // Every prefix match must appear before every substring match.
    expect(names.slice(0, prefixNames.length)).toEqual(prefixNames);
    expect(names.slice(prefixNames.length)).toEqual(substringNames);
    // Each group is internally alphabetical.
    expect(prefixNames).toEqual([...prefixNames].sort((a, b) => a.localeCompare(b)));
    expect(substringNames).toEqual([...substringNames].sort((a, b) => a.localeCompare(b)));
  });
});

describe('getCityById', () => {
  it('returns the matching city record', () => {
    expect(getCityById('paris-fr')).toMatchObject({ name: 'Paris', country: 'France', tzid: 'Europe/Paris' });
  });

  it('returns null for an unknown id', () => {
    expect(getCityById('not-a-real-city')).toBeNull();
  });
});
