import { afterEach, describe, expect, it, vi } from 'vitest';

import { RateLimitBucket } from '@/durable/RateLimitBucket';
import { claimRateLimitWindow } from '@/services/rateLimit';

function createSerialStorage() {
  const state = new Map<string, unknown>();
  let tail: Promise<void> = Promise.resolve();
  let transactionCount = 0;

  const storage = {
    transaction<T>(closure: (txn: DurableObjectTransaction) => Promise<T>): Promise<T> {
      transactionCount += 1;
      const run = tail.then(() =>
        closure({
          async get<V = unknown>(key: string) {
            return state.get(key) as V | undefined;
          },
          async put<V>(key: string, value: V) {
            state.set(key, value);
          }
        } as DurableObjectTransaction)
      );
      tail = run.then(() => undefined, () => undefined);
      return run;
    }
  } as Pick<DurableObjectStorage, 'transaction'>;

  return {
    storage,
    transactionCount: () => transactionCount
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('claimRateLimitWindow', () => {
  it('allows exactly the configured number of concurrent attempts', async () => {
    const harness = createSerialStorage();
    const limit = 7;
    const attempts = 25;
    const nowMs = 180_123;
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        claimRateLimitWindow(harness.storage, nowMs, { limit, windowSeconds: 60 })
      )
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(limit);
    expect(results.filter((result) => !result.allowed)).toHaveLength(attempts - limit);
    expect(results.filter((result) => !result.allowed).every((result) => result.remaining === 0)).toBe(true);
  });

  it('allows exactly one of two simultaneous attempts at limit one', async () => {
    const harness = createSerialStorage();
    const results = await Promise.all([
      claimRateLimitWindow(harness.storage, 61_000, { limit: 1, windowSeconds: 60 }),
      claimRateLimitWindow(harness.storage, 61_000, { limit: 1, windowSeconds: 60 })
    ]);

    expect(results.map((result) => result.allowed).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.allowed)?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('persists an active window and resets only after the next fixed window starts', async () => {
    const harness = createSerialStorage();
    const first = await claimRateLimitWindow(harness.storage, 119_000, { limit: 1, windowSeconds: 60 });
    const denied = await claimRateLimitWindow(harness.storage, 119_500, { limit: 1, windowSeconds: 60 });
    const reset = await claimRateLimitWindow(harness.storage, 120_000, { limit: 1, windowSeconds: 60 });

    expect(first.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(reset).toMatchObject({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
  });

  it.each([
    { limit: 0, windowSeconds: 60 },
    { limit: -1, windowSeconds: 60 },
    { limit: 1.5, windowSeconds: 60 },
    { limit: 1, windowSeconds: 0 },
    { limit: 1, windowSeconds: -1 },
    { limit: 1, windowSeconds: 1.5 }
  ])('rejects invalid policy before opening a storage transaction', async (input) => {
    const harness = createSerialStorage();

    await expect(claimRateLimitWindow(harness.storage, 60_000, input)).rejects.toThrow(RangeError);
    expect(harness.transactionCount()).toBe(0);
  });
});

describe('RateLimitBucket', () => {
  it('uses Durable Object storage and the current clock for check decisions', async () => {
    const harness = createSerialStorage();
    vi.spyOn(Date, 'now').mockReturnValue(120_500);
    const bucket = Object.create(RateLimitBucket.prototype) as RateLimitBucket;
    Object.defineProperty(bucket, 'ctx', { value: { storage: harness.storage } });

    const first = await bucket.check({ limit: 1, windowSeconds: 60 });
    const second = await bucket.check({ limit: 1, windowSeconds: 60 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });
});
