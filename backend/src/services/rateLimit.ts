import type { RateLimitBucket } from '@/durable/RateLimitBucket';
import type { Env } from '@/types';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitPolicyInput {
  limit: number;
  windowSeconds: number;
}

export type StrictRateLimitResult =
  | { status: 'ok'; decision: RateLimitDecision }
  | { status: 'unavailable' };

export function assertRateLimitConfig(limit: number, windowSeconds: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    !Number.isSafeInteger(windowSeconds) ||
    windowSeconds <= 0
  ) {
    throw new RangeError('Rate-limit policy values must be positive safe integers.');
  }
}

export async function claimRateLimitWindow(
  storage: Pick<DurableObjectStorage, 'transaction'>,
  nowMs: number,
  input: RateLimitPolicyInput
): Promise<RateLimitDecision> {
  assertRateLimitConfig(input.limit, input.windowSeconds);
  const windowMs = input.windowSeconds * 1_000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;

  return storage.transaction(async (txn) => {
    const current = await txn.get<{ windowStartMs: number; count: number }>('counter');
    const count = current?.windowStartMs === windowStartMs ? current.count : 0;

    if (count >= input.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowStartMs + windowMs - nowMs) / 1_000)
        )
      };
    }

    const nextCount = count + 1;
    await txn.put('counter', { windowStartMs, count: nextCount });
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - nextCount),
      retryAfterSeconds: 0
    };
  });
}

export async function buildRateLimitObjectName(
  routeClass: string,
  principal: string
): Promise<string> {
  const payload = new TextEncoder().encode(`${routeClass}\u0000${principal}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `rl:${hex}`;
}

export async function enforceStrictRateLimit(
  env: Pick<Env, 'RATE_LIMITER'>,
  routeClass: string,
  principal: string,
  limit: number,
  windowSeconds: number
): Promise<StrictRateLimitResult> {
  assertRateLimitConfig(limit, windowSeconds);
  const name = await buildRateLimitObjectName(routeClass, principal);

  try {
    const stub = env.RATE_LIMITER.getByName(name);
    return {
      status: 'ok',
      decision: await stub.check({ limit, windowSeconds })
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function enforceKvRateLimit(
  env: Pick<Env, 'CACHE'>,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const fullKey = `ratelimit:${key}`;
  const current = Number((await env.CACHE.get(fullKey)) ?? '0');

  if (current >= limit) {
    return false;
  }

  await env.CACHE.put(fullKey, String(current + 1), {
    expirationTtl: windowSeconds
  });
  return true;
}
