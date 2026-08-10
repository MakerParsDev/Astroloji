import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { getDecryptedBirthData } from '@/workers/birthData';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

interface StoredBirthDataRow {
  user_id: string;
  time_certainty: string;
  encrypted_payload: string;
  encryption_iv: string;
  encryption_key_version: number;
  created_at: string;
  updated_at: string;
}

function createBirthDataDb(seed: StoredBirthDataRow[] = []) {
  const rows = new Map(seed.map((row) => [row.user_id, row]));

  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const statement = {
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
        async first() {
          if (normalized.startsWith('SELECT 1 AS ok')) {
            return { ok: 1 };
          }
          if (normalized.includes('FROM user_birth_data')) {
            const userId = statement.bindings[0] as string;
            return rows.get(userId) ?? null;
          }
          return null;
        },
        async run() {
          if (normalized.startsWith('INSERT INTO user_birth_data')) {
            const [userId, timeCertainty, encryptedPayload, encryptionIv, encryptionKeyVersion, createdAt, updatedAt] =
              statement.bindings as [string, string, string, string, number, string, string];
            rows.set(userId, {
              user_id: userId,
              time_certainty: timeCertainty,
              encrypted_payload: encryptedPayload,
              encryption_iv: encryptionIv,
              encryption_key_version: encryptionKeyVersion,
              created_at: rows.get(userId)?.created_at ?? createdAt,
              updated_at: updatedAt
            });
          } else if (normalized.startsWith('DELETE FROM user_birth_data')) {
            rows.delete(statement.bindings[0] as string);
          }
          return { success: true, meta: {} };
        },
        async all() {
          return { results: [] };
        }
      };
      return statement;
    }
  } as unknown as D1Database;

  return { db, rows };
}

const AUTH_HEADERS = { 'content-type': 'application/json' };

async function authHeaders(env: ReturnType<typeof createTestEnv>, userId = 'user-1') {
  const jwt = await signAppJwt(env, { userId, isPremium: false });
  return { ...AUTH_HEADERS, authorization: `Bearer ${jwt}` };
}

describe('PUT /users/me/birth-data', () => {
  it('requires authentication', async () => {
    const response = await createApp().request(
      '/api/v1/users/me/birth-data',
      { method: 'PUT', headers: AUTH_HEADERS, body: JSON.stringify({}) },
      createTestEnv()
    );
    expect(response.status).toBe(401);
  });

  it('rejects an unknown city_id', async () => {
    const env = createTestEnv({ DB: createBirthDataDb().db });
    const response = await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers: await authHeaders(env),
        body: JSON.stringify({
          local_date: '1990-06-15',
          local_time: '14:30:00',
          time_certainty: 'exact',
          city_id: 'not-a-real-city'
        })
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('rejects a missing local_time when time_certainty is not "unknown"', async () => {
    const env = createTestEnv({ DB: createBirthDataDb().db });
    const response = await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers: await authHeaders(env),
        body: JSON.stringify({ local_date: '1990-06-15', time_certainty: 'exact', city_id: 'istanbul-tr' })
      },
      env
    );

    expect(response.status).toBe(400);
  });

  it('saves an exact birth time, storing only an encrypted payload', async () => {
    const { db, rows } = createBirthDataDb();
    const env = createTestEnv({ DB: db });

    const response = await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers: await authHeaders(env),
        body: JSON.stringify({
          local_date: '1990-06-15',
          local_time: '14:30:00',
          time_certainty: 'exact',
          city_id: 'istanbul-tr'
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ time_certainty: 'exact', has_birth_data: true });

    const stored = rows.get('user-1');
    expect(stored?.time_certainty).toBe('exact');
    // The stored payload must not contain the plaintext date, city name, or coordinates anywhere.
    expect(stored?.encrypted_payload).not.toMatch(/1990|istanbul|28\.98|41\.01/i);
  });

  it('accepts an "unknown" time certainty without local_time, using a documented local-noon placeholder', async () => {
    const { db, rows } = createBirthDataDb();
    const env = createTestEnv({ DB: db });

    const response = await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers: await authHeaders(env),
        body: JSON.stringify({ local_date: '1990-06-15', time_certainty: 'unknown', city_id: 'istanbul-tr' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ time_certainty: 'unknown', has_birth_data: true });

    const decrypted = await getDecryptedBirthData(env, 'user-1');
    expect(decrypted?.timeCertainty).toBe('unknown');
    // Istanbul is UTC+3 year-round; local noon -> 09:00 UTC.
    expect(decrypted?.plaintext.timestamp).toBe('1990-06-15T09:00:00.000Z');
  });

  it('overwrites a previous save for the same user (upsert, not a duplicate row)', async () => {
    const { db, rows } = createBirthDataDb();
    const env = createTestEnv({ DB: db });
    const headers = await authHeaders(env);

    await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          local_date: '1990-06-15',
          local_time: '14:30:00',
          time_certainty: 'exact',
          city_id: 'istanbul-tr'
        })
      },
      env
    );
    await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          local_date: '1985-01-01',
          local_time: '08:00:00',
          time_certainty: 'approximate',
          city_id: 'paris-fr'
        })
      },
      env
    );

    expect(rows.size).toBe(1);
    expect(rows.get('user-1')?.time_certainty).toBe('approximate');
  });
});

describe('GET /users/me/birth-data', () => {
  it('reports has_birth_data: false when nothing is stored', async () => {
    const env = createTestEnv({ DB: createBirthDataDb().db });
    const response = await createApp().request(
      '/api/v1/users/me/birth-data',
      { method: 'GET', headers: await authHeaders(env) },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ time_certainty: 'unknown', has_birth_data: false });
  });

  it('never returns decrypted coordinates or the raw timestamp', async () => {
    const { db } = createBirthDataDb();
    const env = createTestEnv({ DB: db });
    const headers = await authHeaders(env);

    await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          local_date: '1990-06-15',
          local_time: '14:30:00',
          time_certainty: 'exact',
          city_id: 'istanbul-tr'
        })
      },
      env
    );

    const response = await createApp().request('/api/v1/users/me/birth-data', { method: 'GET', headers }, env);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toEqual({ time_certainty: 'exact', has_birth_data: true });
    expect(Object.keys(body)).not.toContain('latitude');
    expect(Object.keys(body)).not.toContain('longitude');
    expect(Object.keys(body)).not.toContain('timestamp');
  });
});

describe('DELETE /users/me/birth-data', () => {
  it('removes the stored row', async () => {
    const { db, rows } = createBirthDataDb();
    const env = createTestEnv({ DB: db });
    const headers = await authHeaders(env);

    await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          local_date: '1990-06-15',
          local_time: '14:30:00',
          time_certainty: 'exact',
          city_id: 'istanbul-tr'
        })
      },
      env
    );
    expect(rows.has('user-1')).toBe(true);

    const response = await createApp().request('/api/v1/users/me/birth-data', { method: 'DELETE', headers }, env);

    expect(response.status).toBe(200);
    expect(rows.has('user-1')).toBe(false);
  });
});

describe('getDecryptedBirthData', () => {
  it('returns null when no row exists', async () => {
    const env = createTestEnv({ DB: createBirthDataDb().db });
    await expect(getDecryptedBirthData(env, 'nobody')).resolves.toBeNull();
  });

  it('decrypts a stored row back to its plaintext form', async () => {
    const { db } = createBirthDataDb();
    const env = createTestEnv({ DB: db });
    const headers = await authHeaders(env);

    await createApp().request(
      '/api/v1/users/me/birth-data',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          local_date: '1990-06-15',
          local_time: '14:30:00',
          time_certainty: 'exact',
          city_id: 'istanbul-tr'
        })
      },
      env
    );

    const decrypted = await getDecryptedBirthData(env, 'user-1');
    expect(decrypted).toMatchObject({
      timeCertainty: 'exact',
      plaintext: { latitude: 41.01, longitude: 28.98, tzid: 'Europe/Istanbul', timestamp: '1990-06-15T11:30:00.000Z' }
    });
  });
});
