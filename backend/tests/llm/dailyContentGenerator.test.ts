import { describe, expect, it, vi } from 'vitest';

import {
  buildDailyContentPrompt,
  generateDailySignContent,
  generateDailySignContentOrFallback
} from '@/llm/dailyContentGenerator';
import { LlmProviderError, type LlmGenerateResult, type LlmProvider } from '@/llm/provider';
import type { DailySignContent } from '@/types';

const validPayload = {
  short: 'A bold, focused day.',
  full: 'Today favors decisive action. Trust your instincts and follow through on what you started.',
  love: 'Open, honest conversation strengthens a close bond.',
  career: 'A well-timed idea gets noticed.',
  money: 'A small, considered purchase pays off.',
  health: 'Short bursts of movement lift your energy.',
  lucky_number: 7,
  lucky_color: 'crimson',
  energy: 72,
  love_score: 65,
  career_score: 80,
  money_score: 58,
  health_score: 70,
  daily_tip: 'Pick one thing and finish it before starting the next.'
};

const deterministicFallback: DailySignContent = {
  short: 'fallback short',
  full: 'fallback full',
  love: 'fallback love',
  career: 'fallback career',
  money: 'fallback money',
  health: 'fallback health',
  lucky_number: 3,
  lucky_color: 'blue',
  energy: 50,
  love_score: 50,
  career_score: 50,
  money_score: 50,
  health_score: 50,
  daily_tip: 'fallback tip'
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

const input = { sign: 'aries' as const, language: 'en' as const, date: '2026-08-10' };

describe('buildDailyContentPrompt', () => {
  it('targets the daily_content task and includes the sign and date', () => {
    const request = buildDailyContentPrompt(input);

    expect(request.taskType).toBe('daily_content');
    expect(request.messages[1]?.content).toContain('aries');
    expect(request.messages[1]?.content).toContain('2026-08-10');
  });

  it('writes the Turkish prompt in Turkish for tr requests', () => {
    const request = buildDailyContentPrompt({ ...input, language: 'tr' });

    expect(request.messages[0]?.content).toMatch(/astroloji/i);
    expect(request.messages[1]?.content).toMatch(/burcu/);
  });

  it('writes the Spanish prompt in Spanish for es requests', () => {
    const request = buildDailyContentPrompt({ ...input, language: 'es' });

    expect(request.messages[0]?.content).toMatch(/astrología/i);
    expect(request.messages[1]?.content).toMatch(/horóscopo/i);
  });
});

describe('generateDailySignContent', () => {
  it('parses a well-formed JSON response into DailySignContent', async () => {
    const provider = providerReturning(JSON.stringify(validPayload));

    const result = await generateDailySignContent([provider], input);

    expect(result.content).toEqual(validPayload);
    expect(result.attempts).toEqual([]);
  });

  it('extracts the JSON object when the model wraps it in prose or a code fence', async () => {
    const provider = providerReturning(`Here you go:\n\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\`\nEnjoy!`);

    const result = await generateDailySignContent([provider], input);

    expect(result.content).toEqual(validPayload);
  });

  it('returns null content and an attempt when the response is not valid JSON', async () => {
    const provider = providerReturning('not json at all');

    const result = await generateDailySignContent([provider], input);

    expect(result.content).toBeNull();
    expect(result.attempts).toEqual([{ providerId: 'stub', error: 'Model response was not valid JSON.' }]);
  });

  it('returns null content when the JSON does not match the schema', async () => {
    const provider = providerReturning(JSON.stringify({ ...validPayload, energy: 500 }));

    const result = await generateDailySignContent([provider], input);

    expect(result.content).toBeNull();
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.error).toMatch(/schema/);
  });

  it('returns null content with the router attempts when every provider fails', async () => {
    const provider = failingProvider();

    const result = await generateDailySignContent([provider], input);

    expect(result.content).toBeNull();
    expect(result.attempts).toEqual([{ providerId: 'stub', error: 'stub failed' }]);
  });
});

describe('generateDailySignContentOrFallback', () => {
  it('returns the generated content on success', async () => {
    const provider = providerReturning(JSON.stringify(validPayload));

    const result = await generateDailySignContentOrFallback([provider], input, deterministicFallback);

    expect(result).toEqual(validPayload);
  });

  it('returns the deterministic fallback when generation fails', async () => {
    const provider = failingProvider();

    const result = await generateDailySignContentOrFallback([provider], input, deterministicFallback);

    expect(result).toEqual(deterministicFallback);
  });
});
