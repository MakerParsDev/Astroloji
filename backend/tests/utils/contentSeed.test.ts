import { describe, expect, it } from 'vitest';

import { buildDocumentsForSeed } from '@/utils/contentSeed';

describe('content seed document builder', () => {
  it('builds daily, weekly, and monthly documents across a requested date range', () => {
    const uploads = buildDocumentsForSeed({
      seedDate: '2026-03-21',
      dailyDays: 10
    });

    const dailyKeys = uploads
      .map((item) => item.key)
      .filter((key) => key.startsWith('content/daily/tr/'));
    const weeklyKeys = uploads
      .map((item) => item.key)
      .filter((key) => key.startsWith('content/weekly/tr/'));
    const monthlyKeys = uploads
      .map((item) => item.key)
      .filter((key) => key.startsWith('content/monthly/tr/'));

    expect(dailyKeys).toContain('content/daily/tr/2026-03-21.json');
    expect(dailyKeys).toContain('content/daily/tr/2026-03-30.json');
    expect(weeklyKeys).toContain('content/weekly/tr/2026-W12.json');
    expect(weeklyKeys).toContain('content/weekly/tr/2026-W13.json');
    expect(monthlyKeys).toEqual(['content/monthly/tr/2026-03.json']);
  });

  it('keeps the legacy three-day window when no range override is provided', () => {
    const uploads = buildDocumentsForSeed({
      seedDate: '2026-03-21'
    });

    const dailyKeys = uploads
      .map((item) => item.key)
      .filter((key) => key.startsWith('content/daily/en/'));

    expect(dailyKeys).toEqual([
      'content/daily/en/2026-03-20.json',
      'content/daily/en/2026-03-21.json',
      'content/daily/en/2026-03-22.json'
    ]);
  });

  it('can skip static personality and compatibility uploads during backfill runs', () => {
    const uploads = buildDocumentsForSeed({
      seedDate: '2026-03-21',
      dailyDays: 3,
      skipStaticContent: true
    });

    const keys = uploads.map((item) => item.key);

    expect(keys.some((key) => key.startsWith('content/personality/'))).toBe(false);
    expect(keys.some((key) => key.startsWith('content/compat/'))).toBe(false);
    expect(keys).toContain('content/daily/tr/2026-03-21.json');
    expect(keys).toContain('content/weekly/tr/2026-W12.json');
  });
});
