import type { Env } from '@/types';

import { WorkersAiAdapter } from './adapters/workersAi';
import type { LlmProvider } from './provider';

/**
 * Deep readings and chat replies are longer-form than a daily horoscope, but
 * start on the same free-tier instruction-tuned model as daily content
 * (see dailyContentProviderChain.ts) — paid providers join this chain in a
 * later increment once their API keys exist in Doppler.
 * Was `@cf/meta/llama-3.1-8b-instruct` until Cloudflare deprecated it on
 * 2026-05-30; this is one of Cloudflare's listed replacements
 * (https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations).
 */
const READING_WORKERS_AI_MODEL = '@cf/zai-org/glm-4.7-flash';

export function buildReadingProviderChain(env: Pick<Env, 'AI'>): LlmProvider[] {
  return [new WorkersAiAdapter(env.AI, READING_WORKERS_AI_MODEL)];
}
