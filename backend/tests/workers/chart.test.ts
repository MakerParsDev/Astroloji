import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

describe('chart routes', () => {
  it('requires an authenticated app session', async () => {
    const response = await createApp().request(
      '/api/v1/chart/natal',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          timestamp: '2026-08-05T00:00:00.000Z',
          time_certainty: 'exact'
        })
      },
      createTestEnv()
    );

    expect(response.status).toBe(401);
  });

  it('returns a versioned natal chart without persisting birth data', async () => {
    let writeStatements = 0;
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          if (/\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql)) {
            writeStatements += 1;
          }
          const statement = {
            bind() {
              return statement;
            },
            async first() {
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { success: true, meta: {} };
            }
          };
          return statement;
        }
      } as unknown as D1Database
    });
    const jwt = await signAppJwt(env, { userId: 'chart-user', isPremium: false });

    const response = await createApp().request(
      '/api/v1/chart/natal',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: '2026-08-05T00:00:00.000Z',
          time_certainty: 'exact'
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: 'natal-chart-v1',
      calculationVersion: 'astronomy-engine-2.1.19',
      timeCertainty: 'exact',
      ascendant: null,
      houses: null
    });
    expect(writeStatements).toBe(0);
  });

  it('rejects ambiguous local timestamps', async () => {
    const env = createTestEnv();
    const jwt = await signAppJwt(env, { userId: 'chart-user', isPremium: false });

    const response = await createApp().request(
      '/api/v1/chart/natal',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: '2026-08-05T03:00:00',
          time_certainty: 'exact'
        })
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST' }
    });
  });

  it('returns a bounded stateless transit snapshot', async () => {
    let writeStatements = 0;
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          if (/\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql)) writeStatements += 1;
          const statement = {
            bind() { return statement; },
            async first() { return null; },
            async all() { return { results: [] }; },
            async run() { return { success: true, meta: {} }; }
          };
          return statement;
        }
      } as unknown as D1Database
    });
    const jwt = await signAppJwt(env, { userId: 'chart-user', isPremium: false });

    const response = await createApp().request(
      '/api/v1/chart/transits',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          natal_timestamp: '1990-01-15T12:00:00.000Z',
          natal_time_certainty: 'unknown',
          target_timestamp: '2026-08-05T00:00:00.000Z'
        })
      },
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      version: string;
      aspects: unknown[];
      limitations: string[];
    };
    expect(body.version).toBe('transit-snapshot-v1');
    expect(body.aspects.length).toBeGreaterThan(5);
    expect(body.aspects.length).toBeLessThanOrEqual(30);
    expect(body.limitations).toContain('birth_time_uncertain');
    expect(writeStatements).toBe(0);
  });

});
