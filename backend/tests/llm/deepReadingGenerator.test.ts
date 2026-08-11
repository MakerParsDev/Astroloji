import { describe, expect, it, vi } from 'vitest';

import { buildDeepReadingPrompt, generateDeepReading, type DeepReadingChartSummary } from '@/llm/deepReadingGenerator';
import { LlmProviderError, type LlmGenerateResult, type LlmProvider } from '@/llm/provider';

const chart: DeepReadingChartSummary = {
  sunSign: 'leo',
  sunDegree: 12.3,
  moonSign: 'cancer',
  moonDegree: 4.5,
  ascendantSign: 'libra',
  ascendantDegree: 20.1,
  venusSign: 'virgo',
  venusDegree: 1.2,
  marsSign: 'aries',
  marsDegree: 27.8
};

function providerReturning(text: string): LlmProvider {
  return {
    id: 'stub',
    generate: vi.fn(
      async (): Promise<LlmGenerateResult> => ({
        providerId: 'stub',
        text,
        usage: { inputTokens: 10, outputTokens: 5 }
      })
    )
  };
}

function failingProvider(): LlmProvider {
  return {
    id: 'stub',
    generate: vi.fn(async () => {
      throw new LlmProviderError('stub', 'REQUEST_FAILED', true, 'stub failed');
    })
  };
}

describe('buildDeepReadingPrompt', () => {
  it('targets the deep_reading task and includes the chart placements', () => {
    const request = buildDeepReadingPrompt({ chart, language: 'en' });

    expect(request.taskType).toBe('deep_reading');
    expect(request.messages[1]?.content).toContain('leo');
    expect(request.messages[1]?.content).toContain('cancer');
    expect(request.messages[1]?.content).toContain('libra');
  });

  it('writes the Turkish prompt in Turkish for tr requests', () => {
    const request = buildDeepReadingPrompt({ chart, language: 'tr' });

    expect(request.messages[0]?.content).toMatch(/astroloji/i);
    expect(request.messages[1]?.content).toMatch(/Yükselen/);
  });

  it('writes the Spanish prompt in Spanish for es requests', () => {
    const request = buildDeepReadingPrompt({ chart, language: 'es' });

    expect(request.messages[0]?.content).toMatch(/astrología/i);
    expect(request.messages[1]?.content).toMatch(/Ascendente/);
  });

  it('writes the Portuguese prompt in Portuguese for pt requests', () => {
    const request = buildDeepReadingPrompt({ chart, language: 'pt' });

    expect(request.messages[0]?.content).toMatch(/astrologia/i);
    expect(request.messages[1]?.content).toMatch(/Ascendente/);
  });

  it('writes the German prompt in German for de requests', () => {
    const request = buildDeepReadingPrompt({ chart, language: 'de' });

    expect(request.messages[0]?.content).toMatch(/Astrologie/i);
    expect(request.messages[1]?.content).toMatch(/Aszendent/);
  });

  it('tells the model to skip the rising sign section when it is unavailable', () => {
    const request = buildDeepReadingPrompt({
      chart: { ...chart, ascendantSign: null, ascendantDegree: null },
      language: 'en'
    });

    expect(request.messages[1]?.content).toMatch(/not available because the birth time is unknown/);
  });
});

describe('generateDeepReading', () => {
  const longEnoughText = 'A '.repeat(150);

  it('returns the trimmed model text on success', async () => {
    const provider = providerReturning(`  ${longEnoughText}  `);

    const result = await generateDeepReading([provider], { chart, language: 'en' });

    expect(result.text).toBe(longEnoughText.trim());
    expect(result.attempts).toEqual([]);
  });

  it('rejects a suspiciously short response instead of serving a low-quality reading', async () => {
    const provider = providerReturning('too short');

    const result = await generateDeepReading([provider], { chart, language: 'en' });

    expect(result.text).toBeNull();
    expect(result.attempts).toEqual([{ providerId: 'stub', error: 'Model response was too short.' }]);
  });

  it('returns null with the router attempts when every provider fails', async () => {
    const provider = failingProvider();

    const result = await generateDeepReading([provider], { chart, language: 'en' });

    expect(result.text).toBeNull();
    expect(result.attempts).toEqual([{ providerId: 'stub', error: 'stub failed' }]);
  });
});
