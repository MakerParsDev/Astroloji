import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logMood, getMoodInsight } = vi.hoisted(() => ({
  logMood: vi.fn(),
  getMoodInsight: vi.fn()
}));

vi.mock('@/services/mood', () => ({ logMood, getMoodInsight }));

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

describe('mood worker', () => {
  beforeEach(() => {
    logMood.mockReset();
    getMoodInsight.mockReset();
  });

  it('logs a mood entry', async () => {
    logMood.mockResolvedValue({ date: '2026-08-11', mood: 'good', domain: 'growth' });
    const env = createTestEnv();
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/mood/log',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mood: 'good', domain: 'growth' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ date: '2026-08-11', mood: 'good', domain: 'growth' });
    expect(logMood).toHaveBeenCalledWith(env.DB, 'user-1', 'good', 'growth');
  });

  it('rejects an invalid mood value', async () => {
    const env = createTestEnv();
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/mood/log',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mood: 'euphoric' })
      },
      env
    );

    expect(response.status).toBe(400);
    expect(logMood).not.toHaveBeenCalled();
  });

  it.each([
    ['bulk failed result', '/api/v1/mood/logs', 'failed-batch'],
    ['bulk missing result', '/api/v1/mood/logs', 'incomplete-batch'],
    ['single-date failed result', '/api/v1/mood/logs/2026-10-24', 'failed-date']
  ] as const)('does not report successful mood deletion on %s', async (_label, path, failure) => {
    const env = createTestEnv();
    const existing = env.DB;
    env.DB = {
      ...existing,
      async batch() {
        return failure === 'incomplete-batch'
          ? [{ success: true }]
          : [{ success: true }, { success: false }];
      },
      prepare(sql: string) {
        if (failure === 'failed-date' && sql.startsWith('DELETE FROM mood_logs WHERE')) {
          return {
            bind() {
              return { async run() { return { success: false }; } };
            }
          } as unknown as D1PreparedStatement;
        }
        return existing.prepare(sql);
      }
    } as unknown as D1Database;
    const jwt = await signAppJwt(env, { userId: 'synthetic-user', isPremium: false });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await createApp().request(
        path,
        { method: 'DELETE', headers: { authorization: 'Bearer ' + jwt } },
        env
      );
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    } finally {
      errorLog.mockRestore();
    }
  });

  it('returns the correlation insight', async () => {
    getMoodInsight.mockResolvedValue({ domain: 'communication', occurrences: 4, correlated: 3 });
    const env = createTestEnv();
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/mood/insight',
      { method: 'GET', headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      insight: { domain: 'communication', occurrences: 4, correlated: 3 }
    });
  });

  it('returns a null insight when no pattern is found', async () => {
    getMoodInsight.mockResolvedValue(null);
    const env = createTestEnv();
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/mood/insight',
      { method: 'GET', headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ insight: null });
  });
});
