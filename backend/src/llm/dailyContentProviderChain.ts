import type { Env } from '@/types';

import { WorkersAiAdapter } from './adapters/workersAi';
import type { LlmProvider } from './provider';

/**
 * Small, fast instruction-tuned model — a good fit for short daily-horoscope
 * generation on Cloudflare's free Workers AI tier (10,000 neurons/day,
 * https://developers.cloudflare.com/workers-ai/platform/pricing/).
 * Was `@cf/meta/llama-3.1-8b-instruct` until Cloudflare deprecated it on
 * 2026-05-30. This "-fast" variant is a non-reasoning successor that still
 * returns the plain `{ response: string }` shape `workersAiOutputSchema`
 * expects (verified against the live API) — unlike Cloudflare's other
 * listed replacements (e.g. glm-4.7-flash), which are reasoning models that
 * return an OpenAI-chat-completions shape and can burn the whole
 * `max_tokens` budget on hidden chain-of-thought before emitting content.
 */
const DAILY_CONTENT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/**
 * Faz 0.1 default: Workers AI only. The `AI` binding is always available on
 * the Worker (no secret to provision), which is why daily content — the
 * highest-volume, free-tier task — starts here. Paid providers (Anthropic,
 * NVIDIA NIM, etc.) join this chain in a later increment once their API
 * keys exist in Doppler; llm/router.ts already supports an arbitrary-length
 * fallback chain, so extending this function is additive, not a rewrite.
 */
export function buildDailyContentProviderChain(env: Pick<Env, 'AI'>): LlmProvider[] {
  return [new WorkersAiAdapter(env.AI, DAILY_CONTENT_WORKERS_AI_MODEL)];
}
