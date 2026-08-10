import type { Env } from '@/types';

import { recordLlmUsage } from './budget';
import { LlmProviderError, type LlmGenerateRequest, type LlmGenerateResult, type LlmProvider } from './provider';

export interface LlmRouteAttempt {
  providerId: string;
  error: string;
}

export interface LlmRouteResult {
  /** Null when every provider in the chain failed — caller falls back to deterministic content (contentSeed.ts). */
  result: LlmGenerateResult | null;
  attempts: LlmRouteAttempt[];
}

/**
 * Tries each provider in order and returns the first success. This is a
 * fail-down chain, not fail-closed: a provider error always falls through to
 * the next provider regardless of its `retryable` classification (that field
 * is for caller-side telemetry/alerting, not routing decisions). If every
 * provider fails, the caller is expected to fall back to the existing
 * deterministic content generator so the user never sees an empty screen.
 */
export async function routeLlmGenerate(
  providers: readonly LlmProvider[],
  request: LlmGenerateRequest
): Promise<LlmRouteResult> {
  const attempts: LlmRouteAttempt[] = [];

  for (const provider of providers) {
    try {
      const result = await provider.generate(request);
      return { result, attempts };
    } catch (error) {
      const message =
        error instanceof LlmProviderError ? error.message : error instanceof Error ? error.message : String(error);
      attempts.push({ providerId: provider.id, error: message });
    }
  }

  return { result: null, attempts };
}

/**
 * Same as routeLlmGenerate, but also records token usage against the user's
 * daily budget on success. Budget enforcement (checkLlmBudget) is the
 * caller's responsibility before invoking this — this function only records.
 */
export async function routeLlmGenerateForUser(
  env: Pick<Env, 'CACHE'>,
  providers: readonly LlmProvider[],
  userId: string,
  dateKey: string,
  request: LlmGenerateRequest
): Promise<LlmRouteResult> {
  const routed = await routeLlmGenerate(providers, request);
  if (routed.result) {
    await recordLlmUsage(env, userId, dateKey, routed.result.usage.inputTokens + routed.result.usage.outputTokens);
  }
  return routed;
}
