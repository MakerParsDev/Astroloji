import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSubscriptionStatusMock, verifySubscriptionPurchaseMock } = vi.hoisted(() => ({
  getSubscriptionStatusMock: vi.fn(),
  verifySubscriptionPurchaseMock: vi.fn()
}));

vi.mock('@/services/playBilling', async () => {
  const actual = await vi.importActual<typeof import('@/services/playBilling')>(
    '@/services/playBilling'
  );
  return {
    ...actual,
    getSubscriptionStatus: getSubscriptionStatusMock,
    verifySubscriptionPurchase: verifySubscriptionPurchaseMock
  };
});

import { createApp } from '@/index';
import type { GooglePlaySubscription } from '@/types';
import type { SubscriptionRouteDependencies } from '@/workers/subscription';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

interface RecordingDbOptions {
  pendingRows?: Array<{ purchase_token: string; user_id: string }>;
  subscriptionOwner?: string | null;
}

function createRecordingDb(options: RecordingDbOptions = {}) {
  const writes: Array<{ sql: string; bindings: unknown[] }> = [];
  const reads: Array<{ sql: string; bindings: unknown[] }> = [];

  return {
    writes,
    reads,
    db: {
      prepare(sql: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first() {
            reads.push({ sql, bindings });
            if (sql.includes('SELECT 1 AS ok FROM users')) {
              return { ok: 1 };
            }
            if (sql.includes('SELECT user_id FROM subscriptions')) {
              const owner = options.subscriptionOwner === undefined ? 'user-1' : options.subscriptionOwner;
              return owner ? { user_id: owner } : null;
            }
            return null;
          },
          async all() {
            reads.push({ sql, bindings });
            if (sql.includes('SELECT DISTINCT purchase_token')) {
              return { results: options.pendingRows ?? [] };
            }
            return { results: [] };
          },
          async run() {
            writes.push({ sql, bindings });
            return { success: true, meta: {} };
          }
        };
        return statement;
      },
      async batch() {
        return [];
      }
    } as unknown as D1Database
  };
}

function activeWeeklySubscription(
  purchaseToken = 'weekly-purchase-token'
): GooglePlaySubscription {
  return {
    purchaseToken,
    productId: 'premium_weekly',
    status: 'active',
    startsAt: '2026-08-06T10:00:00.000Z',
    expiresAt: '2026-08-13T10:00:00.000Z',
    autoRenewing: true,
    cancelReason: null,
    raw: {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [
        {
          productId: 'premium_weekly',
          expiryTime: '2026-08-13T10:00:00.000Z',
          autoRenewingPlan: {}
        }
      ]
    }
  };
}

interface RtdnClaimState {
  message_id: string;
  package_name: string;
  message_fingerprint: string;
  status: 'processing' | 'processed';
  lease_token: string;
  lease_expires_at: string;
  outcome?: string | null;
}

interface RtdnDbOptions {
  subscriptionOwner?: string | null;
  initialClaim?: Omit<RtdnClaimState, 'lease_token' | 'lease_expires_at'> &
    Partial<Pick<RtdnClaimState, 'lease_token' | 'lease_expires_at'>>;
  stealLeaseBeforeBatch?: boolean;
}

function createRtdnDb(options: RtdnDbOptions = {}) {
  const writes: Array<{ sql: string; bindings: unknown[] }> = [];
  const batchWrites: Array<{ sql: string; bindings: unknown[] }> = [];
  const appliedBatchWrites: Array<{ sql: string; bindings: unknown[] }> = [];
  const reads: Array<{ sql: string; bindings: unknown[] }> = [];
  const claims = new Map<string, RtdnClaimState>();
  if (options.initialClaim) {
    claims.set(options.initialClaim.message_id, {
      lease_token: 'seed-lease',
      lease_expires_at: '2099-01-01T00:00:00.000Z',
      ...options.initialClaim
    });
  }

  function leaseMatches(bindings: unknown[]) {
    const [messageId, fingerprint, leaseToken, checkedAt] = bindings.slice(-4).map(String);
    const row = claims.get(messageId);
    return Boolean(
      row && row.message_fingerprint === fingerprint && row.lease_token === leaseToken &&
      row.status === 'processing' && row.lease_expires_at > checkedAt
    );
  }

  function makeStatement(sql: string) {
    let bindings: unknown[] = [];
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const statement = {
      _sql: sql,
      _bindings: bindings,
      bind(...values: unknown[]) {
        bindings = values;
        statement._bindings = values;
        return statement;
      },
      async first() {
        reads.push({ sql, bindings });
        if (normalized.includes('SELECT user_id FROM subscriptions')) {
          const owner = options.subscriptionOwner === undefined ? 'user-1' : options.subscriptionOwner;
          return owner ? { user_id: owner } : null;
        }
        if (normalized.startsWith('SELECT package_name, message_fingerprint, status')) {
          return claims.get(String(bindings[0])) ?? null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        writes.push({ sql, bindings });
        if (normalized.startsWith('INSERT INTO play_rtdn_messages')) {
          const [messageId, packageName, fingerprint, _notificationType, leaseToken, receivedAt, leaseExpiresAt] = bindings.map(String);
          if (claims.has(messageId)) return { success: true, meta: { changes: 0 } };
          claims.set(messageId, {
            message_id: messageId, package_name: packageName, message_fingerprint: fingerprint,
            status: 'processing', lease_token: leaseToken, lease_expires_at: leaseExpiresAt
          });
          void receivedAt;
          return { success: true, meta: { changes: 1 } };
        }
        if (normalized.startsWith('UPDATE play_rtdn_messages SET lease_token')) {
          const [leaseToken, leaseExpiresAt, _receivedAt, messageId, packageName, fingerprint, checkedAt] = bindings.map(String);
          const row = claims.get(messageId);
          const matches = row?.package_name === packageName && row.message_fingerprint === fingerprint &&
            row.status === 'processing' && row.lease_expires_at <= checkedAt;
          if (matches && row) { row.lease_token = leaseToken; row.lease_expires_at = leaseExpiresAt; }
          return { success: true, meta: { changes: matches ? 1 : 0 } };
        }
        if (normalized.startsWith('DELETE FROM play_rtdn_messages')) {
          const [messageId, fingerprint, leaseToken] = bindings.map(String);
          const row = claims.get(messageId);
          const matches = row?.message_fingerprint === fingerprint && row.lease_token === leaseToken && row.status === 'processing';
          if (matches) claims.delete(messageId);
          return { success: true, meta: { changes: matches ? 1 : 0 } };
        }
        if (normalized.startsWith('UPDATE play_rtdn_messages')) {
          const [processedAt, outcome, messageId, fingerprint, leaseToken, checkedAt] = bindings.map(String);
          const row = claims.get(messageId);
          const matches = row?.message_fingerprint === fingerprint && row.lease_token === leaseToken &&
            row.status === 'processing' && row.lease_expires_at > checkedAt;
          if (matches && row) { row.status = 'processed'; row.outcome = outcome; }
          void processedAt;
          return { success: true, meta: { changes: matches ? 1 : 0 } };
        }
        return { success: true, meta: { changes: 1 } };
      }
    };
    return statement;
  }

  const db = {
    prepare: makeStatement,
    async batch(statements: D1PreparedStatement[]) {
      if (options.stealLeaseBeforeBatch) {
        const current = [...claims.values()].find((row) => row.status === 'processing');
        if (current) {
          current.lease_token = 'other-worker-lease';
          current.lease_expires_at = '2099-01-01T00:00:00.000Z';
        }
      }
      const results: Array<{ success: boolean; meta: { changes: number } }> = [];
      for (const raw of statements as Array<D1PreparedStatement & { _sql: string; _bindings: unknown[] }>) {
        batchWrites.push({ sql: raw._sql, bindings: raw._bindings });
        const normalized = raw._sql.replace(/\s+/g, ' ').trim();
        if (normalized.startsWith('UPDATE play_rtdn_messages')) {
          const [processedAt, outcome, messageId, fingerprint, leaseToken, checkedAt] = raw._bindings.map(String);
          const row = claims.get(messageId);
          const matches = row?.message_fingerprint === fingerprint && row.lease_token === leaseToken &&
            row.status === 'processing' && row.lease_expires_at > checkedAt;
          if (matches && row) { row.status = 'processed'; row.outcome = outcome; }
          void processedAt;
          results.push({ success: true, meta: { changes: matches ? 1 : 0 } });
          continue;
        }
        const guarded = /EXISTS \( ?SELECT 1 FROM play_rtdn_messages/.test(normalized);
        const changes = guarded ? Number(leaseMatches(raw._bindings)) : 1;
        if (changes === 1) appliedBatchWrites.push({ sql: raw._sql, bindings: raw._bindings });
        results.push({ success: true, meta: { changes } });
      }
      return results;
    }
  } as unknown as D1Database;

  return { db, writes, batchWrites, appliedBatchWrites, reads, claims };
}

function playPushEnvelope(messageId: string, notification: unknown) {
  return { message: { messageId, data: btoa(JSON.stringify(notification)) } };
}

function playTestNotification(packageName = 'com.parsfilo.astrology') {
  return { version: '1.0', packageName, eventTimeMillis: '1786147200000', testNotification: { version: '1.0' } };
}

function playSubscriptionNotification(packageName = 'com.parsfilo.astrology', purchaseToken = 'weekly-purchase-token') {
  return {
    version: '1.0', packageName, eventTimeMillis: '1786147200000',
    subscriptionNotification: {
      version: '1.0', notificationType: 4, purchaseToken, subscriptionId: 'premium_weekly'
    }
  };
}

async function testMessageFingerprint(notification: unknown) {
  const decoded = new TextEncoder().encode(JSON.stringify(notification));
  const packageName = String((notification as { packageName?: string }).packageName ?? '');
  const prefix = new TextEncoder().encode(packageName);
  const input = new Uint8Array(prefix.length + 1 + decoded.length);
  input.set(prefix); input[prefix.length] = 0; input.set(decoded, prefix.length + 1);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function acceptingVerifier() {
  return vi.fn(async () => undefined) as unknown as SubscriptionRouteDependencies['verifyPlayRtdnIdentity'];
}

async function authenticatedSubscriptionRequest(
  path: '/api/v1/subscriptions/verify' | '/api/v1/subscriptions/restore',
  event: 'purchased' | 'renewed'
) {
  const { db, writes } = createRecordingDb();
  const env = createTestEnv({
    DB: db,
    PACKAGE_NAME: 'com.parsfilo.astrology'
  });
  const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
  verifySubscriptionPurchaseMock.mockResolvedValue(activeWeeklySubscription());

  const response = await createApp().request(
    path,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        purchase_token: 'weekly-purchase-token',
        product_id: 'premium_weekly'
      })
    },
    env
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    is_premium: true,
    subscription_state: 'active',
    product_id: 'premium_weekly'
  });
  expect(verifySubscriptionPurchaseMock).toHaveBeenCalledWith(
    env,
    'weekly-purchase-token',
    'premium_weekly',
    'com.parsfilo.astrology'
  );
  expect(writes.some((write) => write.bindings.includes('premium_weekly'))).toBe(true);
  expect(writes.some((write) => write.bindings.includes(event))).toBe(true);
}

describe('subscription worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSubscriptionStatusMock.mockReset();
    verifySubscriptionPurchaseMock.mockReset();
  });

  it('accepts a valid OIDC test notification without touching customer state', async () => {
    const verifier = acceptingVerifier();
    const { db, writes, batchWrites, claims } = createRtdnDb({ subscriptionOwner: null });
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    const notification = playTestNotification();
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: verifier } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST',
        headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('test-message-1', notification))
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, test: true });
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
    expect(batchWrites.some((write) => /subscriptions|UPDATE users|subscription_events/.test(write.sql))).toBe(false);
    expect(writes.some((write) => /subscriptions|UPDATE users|subscription_events/.test(write.sql))).toBe(false);
    expect(claims.get('test-message-1')).toMatchObject({ status: 'processed', outcome: 'test' });
  });

  it('rejects package mismatch before claim or Play lookup', async () => {
    const { db, writes } = createRtdnDb();
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST',
        headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('wrong-package-message', playTestNotification('com.other.app')))
      },
      env
    );

    expect(response.status).toBe(400);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
    expect(writes.some((write) => write.sql.includes('play_rtdn_messages'))).toBe(false);
  });

  it('processes a first subscription delivery once in one transactional batch', async () => {
    const { db, batchWrites, claims } = createRtdnDb();
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    getSubscriptionStatusMock.mockResolvedValue(activeWeeklySubscription());
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST',
        headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('subscription-message-1', playSubscriptionNotification()))
      },
      env
    );

    expect(response.status).toBe(200);
    expect(getSubscriptionStatusMock).toHaveBeenCalledTimes(1);
    expect(getSubscriptionStatusMock).toHaveBeenCalledWith(
      env, 'weekly-purchase-token', 'premium_weekly', 'com.parsfilo.astrology'
    );
    expect(batchWrites).toHaveLength(4);
    expect(batchWrites.map((write) => write.sql.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('INSERT INTO subscriptions'),
      expect.stringContaining('UPDATE users SET is_premium'),
      expect.stringContaining('INSERT INTO subscription_events'),
      expect.stringContaining('UPDATE play_rtdn_messages')
    ]);
    expect(claims.get('subscription-message-1')).toMatchObject({ status: 'processed', outcome: 'processed' });
  });

  it('reclaims an expired processing lease and completes the delivery under a new owner token', async () => {
    const notification = playSubscriptionNotification();
    const fingerprint = await testMessageFingerprint(notification);
    const { db, claims } = createRtdnDb({
      initialClaim: {
        message_id: 'stale-message', package_name: 'com.parsfilo.astrology',
        message_fingerprint: fingerprint, status: 'processing',
        lease_token: 'stale-owner', lease_expires_at: '2000-01-01T00:00:00.000Z'
      }
    });
    getSubscriptionStatusMock.mockResolvedValue(activeWeeklySubscription());

    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('stale-message', notification))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );

    expect(response.status).toBe(200);
    expect(claims.get('stale-message')).toMatchObject({ status: 'processed', outcome: 'processed' });
    expect(claims.get('stale-message')?.lease_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fences all customer writes when lease ownership is lost before the D1 batch', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db, appliedBatchWrites, claims } = createRtdnDb({ stealLeaseBeforeBatch: true });
    getSubscriptionStatusMock.mockResolvedValue(activeWeeklySubscription());

    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('lost-lease-message', playSubscriptionNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );

    expect(response.status).toBe(500);
    expect(appliedBatchWrites.filter((write) =>
      /subscriptions|UPDATE users|subscription_events/.test(write.sql)
    )).toHaveLength(0);
    expect(claims.get('lost-lease-message')).toMatchObject({
      status: 'processing', lease_token: 'other-worker-lease'
    });
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(logSpy.mock.calls)).toContain('retryable_failure');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('lost-lease-message');
  });

  it('acknowledges a processed duplicate without repeating Play lookup or writes', async () => {
    const notification = playSubscriptionNotification();
    const fingerprint = await testMessageFingerprint(notification);
    const { db, batchWrites } = createRtdnDb({
      initialClaim: {
        message_id: 'duplicate-message', package_name: 'com.parsfilo.astrology',
        message_fingerprint: fingerprint, status: 'processed', outcome: 'processed'
      }
    });
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('duplicate-message', notification))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(200);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
    expect(batchWrites).toHaveLength(0);
  });

  it('returns retryable non-2xx for a matching processing duplicate', async () => {
    const notification = playSubscriptionNotification();
    const fingerprint = await testMessageFingerprint(notification);
    const { db } = createRtdnDb({
      initialClaim: {
        message_id: 'processing-message', package_name: 'com.parsfilo.astrology',
        message_fingerprint: fingerprint, status: 'processing'
      }
    });
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('processing-message', notification))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(503);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
  });

  it('rejects same message ID with a different fingerprint before Play lookup', async () => {
    const { db } = createRtdnDb({
      initialClaim: {
        message_id: 'mismatch-message', package_name: 'com.parsfilo.astrology',
        message_fingerprint: 'different-fingerprint', status: 'processed'
      }
    });
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('mismatch-message', playSubscriptionNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(409);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
  });

  it('releases a claim after a transient Play lookup exception', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db, claims } = createRtdnDb();
    getSubscriptionStatusMock.mockRejectedValue(new Error('transient play failure'));
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('retry-message', playSubscriptionNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(500);
    expect(claims.has('retry-message')).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it('does not downgrade an invalid bearer to a valid legacy query secret', async () => {
    const verifier = vi.fn(async () => { throw new Error('invalid bearer'); }) as unknown as SubscriptionRouteDependencies['verifyPlayRtdnIdentity'];
    const { db } = createRtdnDb();
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: verifier } }).request(
      '/api/v1/webhooks/play-rtdn?token=play-secret',
      {
        method: 'POST', headers: { authorization: 'Bearer invalid-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('downgrade-message', playTestNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(403);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
  });

  it.each([
    ['query token', '/api/v1/webhooks/play-rtdn?token=play-secret', {}],
    ['legacy header', '/api/v1/webhooks/play-rtdn', { 'x-play-secret': 'play-secret' }]
  ])('rejects the historical %s path before payload validation', async (_name, path, extraHeaders) => {
    const { db, claims } = createRtdnDb({ subscriptionOwner: null });
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      path,
      {
        method: 'POST', headers: { 'content-type': 'application/json', ...extraHeaders },
        body: JSON.stringify(playPushEnvelope(`legacy-${_name}`, playTestNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(403);
    expect(claims.size).toBe(0);
    expect(getSubscriptionStatusMock).not.toHaveBeenCalled();
  });

  it('batches sync_pending event and message finalization when live state is unavailable', async () => {
    const { db, batchWrites, claims } = createRtdnDb();
    getSubscriptionStatusMock.mockResolvedValue(null);
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('pending-message', playSubscriptionNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, reconciliation: 'pending' });
    expect(batchWrites).toHaveLength(2);
    expect(batchWrites[0]?.sql).toContain('INSERT INTO subscription_events');
    expect(batchWrites[1]?.sql).toContain('UPDATE play_rtdn_messages');
    expect(claims.get('pending-message')).toMatchObject({ status: 'processed', outcome: 'reconciliation_pending' });
  });

  it('finalizes an unknown purchase as ignored when Play also has no state', async () => {
    const { db, claims } = createRtdnDb({ subscriptionOwner: null });
    getSubscriptionStatusMock.mockResolvedValue(null);
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('unknown-message', playSubscriptionNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(200);
    expect(claims.get('unknown-message')).toMatchObject({ status: 'processed', outcome: 'ignored_unknown_purchase' });
  });

  it('releases and returns retryable non-2xx when Play has state but no local owner', async () => {
    const { db, claims } = createRtdnDb({ subscriptionOwner: null });
    getSubscriptionStatusMock.mockResolvedValue(activeWeeklySubscription());
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer oidc-test-token', 'content-type': 'application/json' },
        body: JSON.stringify(playPushEnvelope('owner-missing-message', playSubscriptionNotification()))
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(503);
    expect(claims.has('owner-missing-message')).toBe(false);
  });

  it('logs only bounded RTDN correlation fields', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db } = createRtdnDb();
    getSubscriptionStatusMock.mockResolvedValue(activeWeeklySubscription('sensitive-purchase-token'));
    const notification = playSubscriptionNotification('com.parsfilo.astrology', 'sensitive-purchase-token');
    const envelope = playPushEnvelope('sensitive-full-message-id', notification);
    const encodedData = envelope.message.data;
    const response = await createApp({ subscription: { verifyPlayRtdnIdentity: acceptingVerifier() } }).request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST', headers: { authorization: 'Bearer sensitive-bearer-token', 'content-type': 'application/json' },
        body: JSON.stringify(envelope)
      },
      createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' })
    );
    expect(response.status).toBe(200);
    expect(logSpy).toHaveBeenCalled();
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain('sensitive-bearer-token');
    expect(logged).not.toContain('play-secret');
    expect(logged).not.toContain('sensitive-purchase-token');
    expect(logged).not.toContain(encodedData);
    expect(logged).not.toContain('sensitive-full-message-id');
    expect(logged).not.toContain('play-rtdn-push@example-project.iam.gserviceaccount.com');
  });

  it('verifies and persists weekly subscriptions', async () => {
    await authenticatedSubscriptionRequest('/api/v1/subscriptions/verify', 'purchased');
  });

  it('restores and persists weekly subscriptions', async () => {
    await authenticatedSubscriptionRequest('/api/v1/subscriptions/restore', 'renewed');
  });

  it('falls back from monthly to weekly during pending reconciliation audit', async () => {
    const { db, writes } = createRecordingDb({
      pendingRows: [{ purchase_token: 'weekly-purchase-token', user_id: 'user-1' }]
    });
    const env = createTestEnv({
      DB: db,
      PACKAGE_NAME: 'com.parsfilo.astrology'
    });
    getSubscriptionStatusMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeWeeklySubscription());

    const response = await createApp().request(
      '/api/v1/admin/subscriptions/audit',
      {
        headers: { 'x-admin-secret': 'play-write-secret' }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      audited: 1,
      results: [{ user_id: 'user-1', status: 'active' }]
    });
    expect(getSubscriptionStatusMock).toHaveBeenNthCalledWith(
      1,
      env,
      'weekly-purchase-token',
      'premium_monthly',
      'com.parsfilo.astrology'
    );
    expect(getSubscriptionStatusMock).toHaveBeenNthCalledWith(
      2,
      env,
      'weekly-purchase-token',
      'premium_weekly',
      'com.parsfilo.astrology'
    );
    expect(writes.some((write) => write.bindings.includes('premium_weekly'))).toBe(true);
  });
});
