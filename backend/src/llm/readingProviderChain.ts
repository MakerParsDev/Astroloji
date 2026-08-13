import type { Env } from '@/types';

import { WorkersAiAdapter } from './adapters/workersAi';
import type { LlmProvider } from './provider';

/**
 * Deep readings and chat replies are longer-form than a daily horoscope, but
 * start on the same free-tier instruction-tuned model as daily content
 * (see dailyContentProviderChain.ts) — paid providers join this chain in a
 * later increment once their API keys exist in Doppler.
 * Was `@cf/meta/llama-3.1-8b-instruct` until Cloudflare deprecated it on
 * 2026-05-30. This "-fast" variant is a non-reasoning successor that still
 * returns the plain `{ response: string }` shape `workersAiOutputSchema`
 * expects (verified against the live API) — unlike Cloudflare's other
 * listed replacements (e.g. glm-4.7-flash), which are reasoning models that
 * return an OpenAI-chat-completions shape and can burn the whole
 * `max_tokens` budget on hidden chain-of-thought before emitting content.
 */
const READING_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

export function buildReadingProviderChain(env: Pick<Env, 'AI'>): LlmProvider[] {
  return [new WorkersAiAdapter(env.AI, READING_WORKERS_AI_MODEL)];
}
