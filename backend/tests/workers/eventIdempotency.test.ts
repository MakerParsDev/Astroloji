import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv, FREE_AUTH_ENTITLEMENT } from '../helpers/env';

const EVENT_ID = '01234567-89ab-4cde-8f01-23456789abcd';

interface StoredEvent {
  id: string;
  userId: string;
  eventType: string;
  meta: string;
}

function createEventTestEnv() {
  const stored = new Map<string, StoredEvent>();
  const env = createTestEnv({
    DB: {
      prepare(sql: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first() {
            if (sql.includes('SELECT is_premium, subscription_state, premium_expires_at')) {
              return FREE_AUTH_ENTITLEMENT;
            }
            return null;
          },
          async run() {
            if (!sql.includes('INSERT INTO user_events')) throw new Error(`Unexpected SQL: ${sql}`);
            if (!sql.includes('ON CONFLICT(id) DO NOTHING')) throw new Error('Expected atomic insert');
            const [id, userId, eventType, meta] = bindings as string[];
            const changes = stored.has(id) ? 0 : 1;
            if (changes > 0) stored.set(id, { id, userId, eventType, meta });
            return { success: true, meta: { changes } };
          }
        };
        return statement;
      }
    } as unknown as D1Database
  });
  return { env, stored };
}

async function post(
  env: ReturnType<typeof createTestEnv>,
  userId: string,
  body: Record<string, unknown>
) {
  const token = await signAppJwt(env, { userId, isPremium: false });
  return createApp().request('/api/v1/events/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }, env);
}

describe('event delivery idempotency', () => {
  it('acknowledges retries with the same event_id only once per user', async () => {
    const { env, stored } = createEventTestEnv();
    const first = { event_type: 'daily_viewed', event_id: EVENT_ID, meta: { sign: 'aries' } };
    const second = { ...first, meta: { sign: 'taurus' } };

    const original = await post(env, 'user-1', first);
    const retry = await post(env, 'user-1', second);

    expect(original.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true });
    expect(stored.size).toBe(1);
    expect([...stored.values()][0]).toMatchObject({
      userId: 'user-1', eventType: 'daily_viewed', meta: '{"sign":"aries"}'
    });
  });

  it('does not allow one user event to suppress the same UUID from another user', async () => {
    const { env, stored } = createEventTestEnv();

    expect((await post(env, 'user-1', { event_type: 'app_open', event_id: EVENT_ID })).status).toBe(200);
    expect((await post(env, 'user-2', { event_type: 'app_open', event_id: EVENT_ID })).status).toBe(200);
    expect(stored.size).toBe(2);
    expect([...stored.values()].map((row) => row.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  it('keeps two different event UUIDs as two records for the same user', async () => {
    const { env, stored } = createEventTestEnv();
    const otherId = '12345678-1234-4abc-8def-123456789abc';

    expect((await post(env, 'user-1', { event_type: 'app_open', event_id: EVENT_ID })).status).toBe(200);
    expect((await post(env, 'user-1', { event_type: 'app_open', event_id: otherId })).status).toBe(200);
    expect(stored.size).toBe(2);
  });

  it('still accepts multiple events from an old client with no event_id', async () => {
    const { env, stored } = createEventTestEnv();
    const legacy = { event_type: 'weekly_viewed', meta: { sign: 'leo' } };

    expect((await post(env, 'user-1', legacy)).status).toBe(200);
    expect((await post(env, 'user-1', legacy)).status).toBe(200);
    expect(stored.size).toBe(2);
    expect([...stored.keys()].every((key) => !key.startsWith('evt:'))).toBe(true);
  });

  it('rejects malformed event IDs without writing user events', async () => {
    const { env, stored } = createEventTestEnv();
    const malformed = await post(env, 'user-1', {
      event_type: 'app_open', event_id: 'untrusted:bad-id'
    });

    expect(malformed.status).toBe(400);
    expect(stored.size).toBe(0);
  });

  it('still strips sensitive mood metadata on idempotent event requests', async () => {
    const { env, stored } = createEventTestEnv();
    const event = {
      event_type: 'mood_logged',
      event_id: EVENT_ID,
      meta: { mood: 'stressed', reason: 'private' }
    };

    expect((await post(env, 'user-1', event)).status).toBe(200);
    expect((await post(env, 'user-1', event)).status).toBe(200);
    expect(stored.size).toBe(1);
    expect([...stored.values()][0]?.meta).toBe('{}');
  });
});
