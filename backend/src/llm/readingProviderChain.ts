import type { Env } from '@/types';

import { WorkersAiAdapter } from './adapters/workersAi';
import type { LlmProvider } from './provider';

/**
 * Deep readings and chat replies are longer-form than a daily horoscope, but
 * start on the same free-tier instruction-tuned model as daily content
 * (see dailyContentProviderChain.ts) — paid providers join this chain in a
 * later increment once their API keys exist in Doppler.
 */
const READING_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export function buildReadingProviderChain(env: Pick<Env, 'AI'>): LlmProvider[] {
  return [new WorkersAiAdapter(env.AI, READING_WORKERS_AI_MODEL)];
}
