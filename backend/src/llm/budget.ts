import type { Env } from '@/types';

/** Covers a full day plus timezone skew so a late-arriving write from a user near midnight UTC still expires sanely. */
const BUDGET_TTL_SECONDS = 60 * 60 * 30;

export interface LlmBudgetPolicy {
  dailyTokenLimit: number;
}

export interface LlmBudgetCheck {
  allowed: boolean;
  usedTokens: number;
  remainingTokens: number;
}

function buildBudgetKey(userId: string, dateKey: string): string {
  return `llm-budget:${dateKey}:${userId}`;
}

function readSafeCount(raw: string | null): number {
  const parsed = raw === null ? 0 : Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Best-effort budget: KV has no atomic increment, so concurrent writes can
 * race. This is a cost guardrail against runaway spend, not a security
 * boundary — under-counting in a race only ever lets a request through, never
 * blocks a legitimate one, and the deterministic cache in cache.ts means most
 * requests never reach this check at all (they read a cached response).
 */
export async function checkLlmBudget(
  env: Pick<Env, 'CACHE'>,
  userId: string,
  dateKey: string,
  policy: LlmBudgetPolicy
): Promise<LlmBudgetCheck> {
  const usedTokens = readSafeCount(await env.CACHE.get(buildBudgetKey(userId, dateKey), 'text'));
  return {
    allowed: usedTokens < policy.dailyTokenLimit,
    usedTokens,
    remainingTokens: Math.max(0, policy.dailyTokenLimit - usedTokens)
  };
}

export async function recordLlmUsage(
  env: Pick<Env, 'CACHE'>,
  userId: string,
  dateKey: string,
  tokensUsed: number
): Promise<void> {
  if (!Number.isSafeInteger(tokensUsed) || tokensUsed < 0) {
    throw new RangeError('tokensUsed must be a non-negative safe integer.');
  }

  const key = buildBudgetKey(userId, dateKey);
  const current = readSafeCount(await env.CACHE.get(key, 'text'));
  await env.CACHE.put(key, String(current + tokensUsed), { expirationTtl: BUDGET_TTL_SECONDS });
}
