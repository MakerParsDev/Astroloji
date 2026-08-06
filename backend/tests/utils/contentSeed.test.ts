import { describe, expect, it } from 'vitest';

import { assertSeedQuality, buildDocumentsForSeed } from '@/utils/contentSeed';

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

  it('varies daily guidance across signs and calendar days', () => {
    const uploads = buildDocumentsForSeed({
      seedDate: '2026-03-21',
      dailyDays: 2,
      skipStaticContent: true
    });
    const first = uploads.find((item) => item.key === 'content/daily/en/2026-03-21.json');
    const second = uploads.find((item) => item.key === 'content/daily/en/2026-03-22.json');
    const firstSigns = (first?.payload as { signs: Record<string, { short: string }> }).signs;
    const secondSigns = (second?.payload as { signs: Record<string, { short: string }> }).signs;

    expect(new Set(Object.values(firstSigns).map((entry) => entry.short)).size).toBeGreaterThanOrEqual(8);
    expect(firstSigns.aries.short).not.toEqual(secondSigns.aries.short);
  });

  it('builds symmetric pair-specific compatibility without placeholder celebrities', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21' });
    const compatibility = uploads.filter((item) => item.key.startsWith('content/compat/en/'));
    const byKey = new Map(compatibility.map((item) => [item.key, item.payload]));
    const signatures = new Set(
      compatibility.map((item) => {
        const payload = item.payload as {
          overall_score: number;
          love_score: number;
          friendship_score: number;
          work_score: number;
          famous_couples: string[];
        };
        expect(payload.famous_couples).toEqual([]);
        return [payload.overall_score, payload.love_score, payload.friendship_score, payload.work_score].join(':');
      })
    );

    expect(signatures.size).toBeGreaterThanOrEqual(20);
    const ariesLeo = byKey.get('content/compat/en/aries-leo.json') as Record<string, unknown>;
    const leoAries = byKey.get('content/compat/en/leo-aries.json') as Record<string, unknown>;
    expect(ariesLeo.overall_score).toEqual(leoAries.overall_score);
    expect(ariesLeo.love_score).toEqual(leoAries.love_score);
    expect(ariesLeo.friendship_score).toEqual(leoAries.friendship_score);
    expect(ariesLeo.work_score).toEqual(leoAries.work_score);
  });

  it('uses sign-specific personality profiles instead of one Aries template', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21' });
    const personalities = uploads
      .filter((item) => item.key.startsWith('content/personality/en/'))
      .map((item) => item.payload as {
        sign: string;
        strengths: string[];
        weaknesses: string[];
        ideal_partners: string[];
        element: string;
        planet: string;
      });

    expect(new Set(personalities.map((item) => item.strengths.join('|'))).size).toBeGreaterThanOrEqual(10);
    expect(new Set(personalities.map((item) => `${item.element}:${item.planet}`)).size).toBeGreaterThanOrEqual(8);
    expect(personalities.find((item) => item.sign === 'aries')?.ideal_partners).not.toEqual(
      personalities.find((item) => item.sign === 'taurus')?.ideal_partners
    );

    const taurusTr = uploads.find((item) => item.key === 'content/personality/tr/taurus.json')?.payload as {
      summary: string;
      deep_analysis: string;
      planet: string;
    };
    expect(taurusTr.summary).not.toContain('i̇');
    expect(taurusTr.deep_analysis).not.toMatch(/\b(?:earth|fixed)\b/);
    expect(taurusTr.planet).toBe('Venüs');
  });


  it('fails closed when seed documents contain placeholder or duplicated production copy', () => {
    const goodUploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 2 });
    expect(() => assertSeedQuality(goodUploads)).not.toThrow();

    const placeholderUploads = [
      {
        key: 'content/compat/en/aries-leo.json',
        payload: { famous_couples: ['Inspirational couple 1'] }
      }
    ];
    expect(() => assertSeedQuality(placeholderUploads)).toThrow(/placeholder/i);

    const duplicatedSigns = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`sign-${index}`, { short: 'Same generic sentence.' }])
    );
    expect(() =>
      assertSeedQuality([
        {
          key: 'content/daily/en/2026-03-21.json',
          payload: { signs: duplicatedSigns }
        }
      ])
    ).toThrow(/unique daily summaries/i);
  });


  it('attaches traceable generation metadata to every document', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 2 });

    for (const upload of uploads) {
      const payload = upload.payload as {
        content_version?: string;
        generated_at?: string;
        calculation_version?: string;
        editorial_status?: string;
        source_signals?: string[];
      };
      expect(payload.content_version).toBe('seed-v2');
      expect(payload.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(payload.calculation_version).toBe('deterministic-profile-v1');
      expect(payload.editorial_status).toBe('generated_quality_checked');
      expect(payload.source_signals?.length).toBeGreaterThan(0);
    }
  });

});
