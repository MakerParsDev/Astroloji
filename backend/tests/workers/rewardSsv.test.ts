import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import type { ParsedAdmobSsvCallback } from '@/services/admobSsv';
import type { Env, RewardChallengeRow } from '@/types';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

const CHALLENGE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_CHALLENGE_ID = '22222222-2222-4222-8222-222222222222';
const NOW_ISO = '2026-07-26T16:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const AD_UNIT = 'ca-app-pub-3940256099942544/5224354917';
const TRANSACTION_ID = '18fa792de1bca816048293fc71035638';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createRewardDb() {
  const rows = new Map<string, RewardChallengeRow>();

  const db = {
    prepare(sql: string) {
      const statement = {
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
        async first<T>() {
          const query = normalize(sql);
          if (query.includes('FROM reward_challenges WHERE id = ?')) {
            return (rows.get(String(statement.bindings[0])) ?? null) as T | null;
          }
          if (query.includes('FROM reward_challenges WHERE transaction_id = ?')) {
            const transactionId = String(statement.bindings[0]);
            return ([...rows.values()].find((row) => row.transaction_id === transactionId) ?? null) as T | null;
          }
          if (
            query.includes('SELECT id FROM reward_challenges') &&
            query.includes("status = 'consumed'")
          ) {
            const [userId, rewardType, identifier, nowIso] = statement.bindings.map(String);
            const row = [...rows.values()].find(
              (candidate) =>
                candidate.user_id === userId &&
                candidate.reward_type === rewardType &&
                candidate.identifier === identifier &&
                candidate.status === 'consumed' &&
                Boolean(candidate.entitlement_expires_at) &&
                String(candidate.entitlement_expires_at) > nowIso
            );
            return (row ? { id: row.id } : null) as T | null;
          }
          return null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          const query = normalize(sql);
          if (query.startsWith('INSERT INTO reward_challenges')) {
            const [id, userId, rewardType, identifier, createdAt, expiresAt] = statement.bindings.map(String);
            rows.set(id, {
              id,
              user_id: userId,
              reward_type: rewardType as RewardChallengeRow['reward_type'],
              identifier,
              status: 'pending',
              transaction_id: null,
              ad_unit: null,
              callback_timestamp_ms: null,
              created_at: createdAt,
              expires_at: expiresAt,
              verified_at: null,
              consumed_at: null,
              entitlement_expires_at: null
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (query.startsWith('UPDATE reward_challenges SET status = \'verified\'')) {
            const [transactionId, adUnit, callbackTimestampMs, verifiedAt, id, nowIso] = statement.bindings;
            const row = rows.get(String(id));
            const transactionUsed = [...rows.values()].some(
              (candidate) => candidate.id !== id && candidate.transaction_id === transactionId
            );
            if (
              !row ||
              transactionUsed ||
              row.status !== 'pending' ||
              row.transaction_id !== null ||
              row.expires_at <= String(nowIso)
            ) {
              return { success: true, meta: { changes: 0 } };
            }
            rows.set(row.id, {
              ...row,
              status: 'verified',
              transaction_id: String(transactionId),
              ad_unit: String(adUnit),
              callback_timestamp_ms: Number(callbackTimestampMs),
              verified_at: String(verifiedAt)
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (query.startsWith('UPDATE reward_challenges SET status = \'consumed\'')) {
            const [consumedAt, entitlementExpiresAt, id, userId, nowIso] = statement.bindings;
            const row = rows.get(String(id));
            if (
              !row ||
              row.user_id !== String(userId) ||
              row.status !== 'verified' ||
              row.expires_at <= String(nowIso)
            ) {
              return { success: true, meta: { changes: 0 } };
            }
            rows.set(row.id, {
              ...row,
              status: 'consumed',
              consumed_at: String(consumedAt),
              entitlement_expires_at: String(entitlementExpiresAt)
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (query.startsWith('DELETE FROM reward_challenges')) {
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
      };
      return statement;
    },
    async batch() {
      return [];
    }
  } as unknown as D1Database;

  return { db, rows };
}

function verifiedCallback(
  challengeId = CHALLENGE_ID,
  transactionId = TRANSACTION_ID,
  userId = 'user-1',
  adUnit = AD_UNIT,
  timestampMs = NOW_MS
): ParsedAdmobSsvCallback {
  return {
    signedContent: 'signed-content',
    signature: 'signature',
    keyId: '1',
    fields: {
      adNetwork: '5450213213286189855',
      adUnit,
      customData: challengeId,
      rewardAmount: 1,
      rewardItem: 'unlock',
      timestampMs,
      transactionId,
      userId
    }
  };
}

async function createAuthenticatedRequestContext(
  env: Env,
  userId = 'user-1'
): Promise<{ jwt: string }> {
  return {
    jwt: await signAppJwt(env, { userId, isPremium: false })
  };
}

function testApp(args: {
  nowMs?: () => number;
  randomUUID?: () => string;
  verifyCallback?: () => Promise<ParsedAdmobSsvCallback>;
} = {}) {
  return createApp({
    reward: {
      nowMs: args.nowMs ?? (() => NOW_MS),
      randomUUID: args.randomUUID ?? (() => CHALLENGE_ID),
      verifyCallback: args.verifyCallback ?? (async () => verifiedCallback())
    }
  });
}

describe('rewarded access SSV routes', () => {
  it('rejects the legacy client-only claim payload', async () => {
    const { db } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);

    const response = await testApp().request(
      '/api/v1/rewards/claim',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
      },
      env
    );

    expect(response.status).toBe(400);
  });

  it('prepares a short-lived challenge and refuses to claim it before SSV', async () => {
    const { db, rows } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    const app = testApp();

    const prepareResponse = await app.request(
      '/api/v1/rewards/prepare',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
      },
      env
    );

    expect(prepareResponse.status).toBe(201);
    await expect(prepareResponse.json()).resolves.toMatchObject({
      challenge_id: CHALLENGE_ID,
      custom_data: CHALLENGE_ID,
      user_id: 'user-1',
      reward_type: 'daily',
      identifier: '2026-07-26'
    });
    expect(rows.get(CHALLENGE_ID)?.status).toBe('pending');

    const claimResponse = await app.request(
      '/api/v1/rewards/claim',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ challenge_id: CHALLENGE_ID })
      },
      env
    );

    expect(claimResponse.status).toBe(409);
    await expect(claimResponse.json()).resolves.toMatchObject({
      error: { code: 'PENDING_VERIFICATION' }
    });
  });

  it('verifies a callback and consumes the challenge exactly once', async () => {
    const { db, rows } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    const app = testApp();

    await app.request(
      '/api/v1/rewards/prepare',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
      },
      env
    );

    const callbackResponse = await app.request(
      '/api/v1/rewards/ssv?ignored=by-injected-verifier',
      { method: 'GET' },
      env
    );
    expect(callbackResponse.status).toBe(200);
    await expect(callbackResponse.json()).resolves.toEqual({ ok: true, duplicate: false });
    expect(rows.get(CHALLENGE_ID)?.status).toBe('verified');

    const claim = () =>
      app.request(
        '/api/v1/rewards/claim',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
          body: JSON.stringify({ challenge_id: CHALLENGE_ID })
        },
        env
      );

    const firstClaim = await claim();
    expect(firstClaim.status).toBe(200);
    await expect(firstClaim.json()).resolves.toMatchObject({
      ok: true,
      challenge_id: CHALLENGE_ID,
      reward_type: 'daily',
      identifier: '2026-07-26'
    });
    expect(rows.get(CHALLENGE_ID)?.status).toBe('consumed');

    const duplicateClaim = await claim();
    expect(duplicateClaim.status).toBe(200);
    await expect(duplicateClaim.json()).resolves.toMatchObject({ ok: true, duplicate: true });
  });

  it('treats an exact repeated callback as idempotent', async () => {
    const { db } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    const app = testApp();

    await app.request(
      '/api/v1/rewards/prepare',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
      },
      env
    );

    expect((await app.request('/api/v1/rewards/ssv?first', {}, env)).status).toBe(200);
    const duplicate = await app.request('/api/v1/rewards/ssv?second', {}, env);

    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({ ok: true, duplicate: true });
  });

  it('rejects transaction replay against a different challenge', async () => {
    const { db } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    let challengeId = CHALLENGE_ID;
    const app = testApp({
      randomUUID: () => challengeId,
      verifyCallback: async () => verifiedCallback(challengeId)
    });

    for (const identifier of ['2026-07-26', '2026-07-27']) {
      await app.request(
        '/api/v1/rewards/prepare',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reward_type: 'daily', identifier })
        },
        env
      );
      if (identifier === '2026-07-26') {
        expect((await app.request('/api/v1/rewards/ssv?first', {}, env)).status).toBe(200);
        challengeId = SECOND_CHALLENGE_ID;
      }
    }

    const replay = await app.request('/api/v1/rewards/ssv?replay', {}, env);
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: 'TRANSACTION_REPLAY' }
    });
  });

  it('rejects expired, user-mismatched, and ad-unit-mismatched callbacks', async () => {
    const cases = [
      { callback: verifiedCallback(CHALLENGE_ID, TRANSACTION_ID, 'other-user'), code: 'REWARD_USER_MISMATCH' },
      { callback: verifiedCallback(CHALLENGE_ID, TRANSACTION_ID, 'user-1', 'wrong-ad-unit'), code: 'REWARD_AD_UNIT_MISMATCH' }
    ];

    for (const item of cases) {
      const { db } = createRewardDb();
      const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
      const { jwt } = await createAuthenticatedRequestContext(env);
      const app = testApp({ verifyCallback: async () => item.callback });
      await app.request(
        '/api/v1/rewards/prepare',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
        },
        env
      );

      const response = await app.request('/api/v1/rewards/ssv?mismatch', {}, env);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: item.code } });
    }

    let currentMs = NOW_MS;
    const { db } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    const expiredApp = testApp({ nowMs: () => currentMs });
    await expiredApp.request(
      '/api/v1/rewards/prepare',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
      },
      env
    );
    currentMs += 11 * 60 * 1_000;

    const expired = await expiredApp.request('/api/v1/rewards/ssv?expired', {}, env);
    expect(expired.status).toBe(410);
    await expect(expired.json()).resolves.toMatchObject({
      error: { code: 'REWARD_CHALLENGE_EXPIRED' }
    });
  });

  it('does not prepare another challenge for an active entitlement', async () => {
    const { db } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    const app = testApp();
    const request = () =>
      app.request(
        '/api/v1/rewards/prepare',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
        },
        env
      );

    expect((await request()).status).toBe(201);
    expect((await app.request('/api/v1/rewards/ssv?verified', {}, env)).status).toBe(200);
    expect(
      (
        await app.request(
          '/api/v1/rewards/claim',
          {
            method: 'POST',
            headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
            body: JSON.stringify({ challenge_id: CHALLENGE_ID })
          },
          env
        )
      ).status
    ).toBe(200);

    const duplicatePrepare = await request();
    expect(duplicatePrepare.status).toBe(409);
    await expect(duplicatePrepare.json()).resolves.toMatchObject({
      error: { code: 'ALREADY_CLAIMED' }
    });
  });

  it('accepts the numeric ad unit segment used by AdMob SSV callbacks', async () => {
    const { db, rows } = createRewardDb();
    const env = createTestEnv({ DB: db, ADMOB_REWARDED_ID: AD_UNIT });
    const { jwt } = await createAuthenticatedRequestContext(env);
    const app = createApp({
      reward: {
        nowMs: () => NOW_MS,
        randomUUID: () => CHALLENGE_ID,
        verifyCallback: async () =>
          verifiedCallback(
            CHALLENGE_ID,
            TRANSACTION_ID,
            'user-1',
            AD_UNIT.split('/').at(-1) ?? AD_UNIT
          )
      }
    });

    expect(
      (
        await app.request(
          '/api/v1/rewards/prepare',
          {
            method: 'POST',
            headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
            body: JSON.stringify({ reward_type: 'daily', identifier: '2026-07-26' })
          },
          env
        )
      ).status
    ).toBe(201);

    const callback = await app.request('/api/v1/rewards/ssv?numeric-ad-unit', {}, env);
    expect(callback.status).toBe(200);
    expect(rows.get(CHALLENGE_ID)?.status).toBe('verified');
  });

});
