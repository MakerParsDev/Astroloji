import { MAJOR_CITIES, type CityRecord } from '@/data/majorCities';

const DEFAULT_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;

const COMBINING_MARK_RANGE_START = 0x0300;
const COMBINING_MARK_RANGE_END = 0x036f;

function foldDiacritics(value: string): string {
  const decomposed = value.normalize('NFD');
  let result = '';
  for (const character of decomposed) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < COMBINING_MARK_RANGE_START || codePoint > COMBINING_MARK_RANGE_END) {
      result += character;
    }
  }
  return result.toLowerCase();
}

type MatchRank = 0 | 1 | 2; // 0 = exact, 1 = name starts with query, 2 = substring elsewhere

function rankMatch(city: CityRecord, foldedQuery: string): MatchRank | null {
  const foldedName = foldDiacritics(city.name);
  const foldedCountry = foldDiacritics(city.country);

  if (foldedName === foldedQuery) {
    return 0;
  }
  if (foldedName.startsWith(foldedQuery)) {
    return 1;
  }
  if (foldedName.includes(foldedQuery) || foldedCountry.includes(foldedQuery)) {
    return 2;
  }
  return null;
}

/**
 * Case- and diacritic-insensitive city search over the seeded major-cities
 * dataset ("istanbul", "İstanbul", and "Istanbul" all match the same row).
 * Ranks exact name matches first, then name-prefix matches, then any other
 * substring match in name or country, and breaks ties alphabetically so
 * results are stable across calls.
 */
export function searchCities(query: string, limit: number = DEFAULT_LIMIT): CityRecord[] {
  const foldedQuery = foldDiacritics(query.trim());
  if (foldedQuery.length < MIN_QUERY_LENGTH) {
    return [];
  }

  return MAJOR_CITIES.map((city) => ({ city, rank: rankMatch(city, foldedQuery) }))
    .filter((entry): entry is { city: CityRecord; rank: MatchRank } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.city.name.localeCompare(b.city.name))
    .slice(0, limit)
    .map((entry) => entry.city);
}

export function getCityById(id: string): CityRecord | null {
  return MAJOR_CITIES.find((city) => city.id === id) ?? null;
}
