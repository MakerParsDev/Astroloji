import { describe, expect, it, vi } from 'vitest';

import {
  buildChatConsultationPrompt,
  generateChatReply,
  MAX_CHAT_HISTORY_TURNS,
  type ChatConsultationInput,
  type ChatTurn
} from '@/llm/chatConsultationGenerator';
import type { DeepReadingChartSummary } from '@/llm/deepReadingGenerator';
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

const baseInput: ChatConsultationInput = {
  chart,
  language: 'en',
  history: [],
  message: 'What does my rising sign mean?'
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

describe('buildChatConsultationPrompt', () => {
  it('targets chat_consultation and puts the chart context in the system message', () => {
    const request = buildChatConsultationPrompt(baseInput);

    expect(request.taskType).toBe('chat_consultation');
    expect(request.messages[0]?.role).toBe('system');
    expect(request.messages[0]?.content).toContain('leo');
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'What does my rising sign mean?' });
  });

  it('preserves user and assistant turns in order', () => {
    const history: ChatTurn[] = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' }
    ];

    const request = buildChatConsultationPrompt({ ...baseInput, history });

    expect(request.messages.slice(1, 3)).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' }
    ]);
  });

  it('caps history to the most recent turns to bound token cost', () => {
    const history: ChatTurn[] = Array.from({ length: MAX_CHAT_HISTORY_TURNS + 5 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${index}`
    }));

    const request = buildChatConsultationPrompt({ ...baseInput, history });

    // system + capped history + new user message
    expect(request.messages).toHaveLength(1 + MAX_CHAT_HISTORY_TURNS + 1);
    expect(request.messages[1]?.content).toBe(`turn-5`);
  });

  it('includes a non-advice disclaimer in Turkish for tr requests', () => {
    const request = buildChatConsultationPrompt({ ...baseInput, language: 'tr' });

    expect(request.messages[0]?.content).toMatch(/tıbbi, hukuki veya finansal tavsiye/);
  });

  it('includes a non-advice disclaimer in Spanish for es requests', () => {
    const request = buildChatConsultationPrompt({ ...baseInput, language: 'es' });

    expect(request.messages[0]?.content).toMatch(/consejos médicos, legales o financieros/);
  });

  it('includes a non-advice disclaimer in Portuguese for pt requests', () => {
    const request = buildChatConsultationPrompt({ ...baseInput, language: 'pt' });

    expect(request.messages[0]?.content).toMatch(/conselhos médicos, jurídicos ou financeiros/);
  });

  it('includes a non-advice disclaimer in German for de requests', () => {
    const request = buildChatConsultationPrompt({ ...baseInput, language: 'de' });

    expect(request.messages[0]?.content).toMatch(/medizinischen, rechtlichen oder finanziellen Rat/);
  });
});

describe('generateChatReply', () => {
  it('returns the trimmed model reply on success', async () => {
    const provider = providerReturning('  Your rising sign shapes first impressions.  ');

    const result = await generateChatReply([provider], baseInput);

    expect(result.reply).toBe('Your rising sign shapes first impressions.');
    expect(result.attempts).toEqual([]);
  });

  it('treats an empty reply as a failure rather than sending a blank message', async () => {
    const provider = providerReturning('   ');

    const result = await generateChatReply([provider], baseInput);

    expect(result.reply).toBeNull();
    expect(result.attempts).toEqual([{ providerId: 'stub', error: 'Model response was empty.' }]);
  });

  it('returns null with router attempts when every provider fails', async () => {
    const provider = failingProvider();

    const result = await generateChatReply([provider], baseInput);

    expect(result.reply).toBeNull();
    expect(result.attempts).toEqual([{ providerId: 'stub', error: 'stub failed' }]);
  });
});
