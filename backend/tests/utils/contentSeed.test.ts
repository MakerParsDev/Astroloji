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

  it('builds genuine Spanish content, not an English fallback', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 1 });

    const dailyEs = uploads.find((item) => item.key === 'content/daily/es/2026-03-21.json');
    expect(dailyEs).toBeDefined();
    const ariesDaily = (dailyEs?.payload as { signs: Record<string, { short: string }> }).signs.aries;
    expect(ariesDaily.short).toMatch(/[áéíóúñ]/i);
    expect(ariesDaily.short).not.toMatch(/Focus:/);

    const personalityEs = uploads.find((item) => item.key === 'content/personality/es/leo.json');
    expect(personalityEs).toBeDefined();
    const leoPersonality = personalityEs?.payload as { planet: string; element: string };
    expect(leoPersonality.planet).toBe('Sol');
    expect(leoPersonality.element).toBe('fuego');
  });

  it('builds genuine Portuguese content, not an English/Spanish fallback', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 1 });

    const dailyPt = uploads.find((item) => item.key === 'content/daily/pt/2026-03-21.json');
    expect(dailyPt).toBeDefined();
    const ariesDaily = (dailyPt?.payload as { signs: Record<string, { short: string }> }).signs.aries;
    expect(ariesDaily.short).toMatch(/[ãõçáéíóú]/i);
    expect(ariesDaily.short).not.toMatch(/Focus:/);

    const personalityPt = uploads.find((item) => item.key === 'content/personality/pt/leo.json');
    expect(personalityPt).toBeDefined();
    const leoPersonality = personalityPt?.payload as { planet: string; element: string };
    expect(leoPersonality.planet).toBe('Sol');
    expect(leoPersonality.element).toBe('fogo');
  });

  it('builds genuine German content, not an English/Spanish/Portuguese fallback', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 1 });

    const dailyDe = uploads.find((item) => item.key === 'content/daily/de/2026-03-21.json');
    expect(dailyDe).toBeDefined();
    const ariesDaily = (dailyDe?.payload as { signs: Record<string, { short: string }> }).signs.aries;
    expect(ariesDaily.short).toMatch(/[äöüß]/i);
    expect(ariesDaily.short).not.toMatch(/Focus:/);

    const personalityDe = uploads.find((item) => item.key === 'content/personality/de/leo.json');
    expect(personalityDe).toBeDefined();
    const leoPersonality = personalityDe?.payload as { planet: string; element: string };
    expect(leoPersonality.planet).toBe('Sonne');
    expect(leoPersonality.element).toBe('Feuer');
  });

  it('builds genuine French content, not an English/Spanish/Portuguese/German fallback', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 1 });

    const dailyFr = uploads.find((item) => item.key === 'content/daily/fr/2026-03-21.json');
    expect(dailyFr).toBeDefined();
    const ariesDaily = (dailyFr?.payload as { signs: Record<string, { short: string }> }).signs.aries;
    expect(ariesDaily.short).toMatch(/[éèêàçùûî]/i);
    expect(ariesDaily.short).not.toMatch(/Focus:/);

    const personalityFr = uploads.find((item) => item.key === 'content/personality/fr/leo.json');
    expect(personalityFr).toBeDefined();
    const leoPersonality = personalityFr?.payload as { planet: string; element: string };
    expect(leoPersonality.planet).toBe('Soleil');
    expect(leoPersonality.element).toBe('feu');
  });

  it('elides French "de" to "d\'" before a vowel-initial focus phrase in the monthly summary', () => {
    const uploads = buildDocumentsForSeed({ seedDate: '2026-03-21', dailyDays: 1 });

    // Aries' fr focus is "un début audacieux mais mesuré" (vowel-initial: needs "d'un").
    const ariesMonthlyFr = uploads.find((item) => item.key === 'content/monthly/fr/2026-03.json');
    expect(ariesMonthlyFr).toBeDefined();
    const ariesSummary = (ariesMonthlyFr?.payload as { signs: Record<string, { summary: string }> }).signs.aries
      .summary;
    expect(ariesSummary).toMatch(/thème d'un début/);
    expect(ariesSummary).not.toMatch(/thème de un /);

    // Cancer's fr focus is "la sécurité ..." (consonant-initial: keeps "de la").
    const cancerSummary = (ariesMonthlyFr?.payload as { signs: Record<string, { summary: string }> }).signs.cancer
      .summary;
    expect(cancerSummary).toMatch(/thème de la sécurité/);
  });

  it('restricts output to a single language when requested, to stay under the Worker subrequest limit', () => {
    const uploads = buildDocumentsForSeed({
      seedDate: '2026-03-21',
      dailyDays: 1,
      skipStaticContent: false,
      language: 'pt'
    });

    expect(uploads.length).toBeGreaterThan(0);
    expect(uploads.every((item) => item.key.includes('/pt/'))).toBe(true);
    expect(uploads.some((item) => item.key.startsWith('content/compat/pt/'))).toBe(true);
    expect(uploads.some((item) => item.key.includes('/en/'))).toBe(false);
    expect(uploads.some((item) => item.key.includes('/tr/'))).toBe(false);
    expect(uploads.some((item) => item.key.includes('/es/'))).toBe(false);
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
