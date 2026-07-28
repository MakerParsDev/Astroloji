import { Hono } from 'hono';

import { enforceRateLimit } from '@/services/cache';
import {
  AdmobSsvVerificationError,
  type AdmobSsvErrorCode,
  type AdmobSsvVerifierField,
  type AdmobSsvVerifierReason,
  type ParsedAdmobSsvCallback,
  verifyAdmobSsvCallback
} from '@/services/admobSsv';
import type { BindingsFor, RewardChallengeRow, RewardEnv, RewardType } from '@/types';
import { validateRewardClaimBody, validateRewardPrepareBody } from '@/utils/validators';

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const CALLBACK_PAST_SKEW_MS = 15 * 60 * 1_000;
const CALLBACK_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const DAILY_ENTITLEMENT_TTL_MS = 48 * 60 * 60 * 1_000;
const WEEKLY_ENTITLEMENT_TTL_MS = 14 * 24 * 60 * 60 * 1_000;
const PREPARE_RATE_LIMIT = 10;
const PREPARE_RATE_WINDOW_SECONDS = 60;

export interface RewardRouteDependencies {
  nowMs?: () => number;
  randomUUID?: () => string;
  verifyCallback?: (callbackUrl: string) => Promise<ParsedAdmobSsvCallback>;
}

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function normalizeAdUnitId(value: string): string {
  const separator = value.lastIndexOf('/');
  return separator >= 0 ? value.slice(separator + 1) : value;
}

function entitlementTtlMs(rewardType: RewardType): number {
  return rewardType === 'daily' ? DAILY_ENTITLEMENT_TTL_MS : WEEKLY_ENTITLEMENT_TTL_MS;
}

async function getChallenge(db: D1Database, id: string): Promise<RewardChallengeRow | null> {
  return (await db
    .prepare('SELECT * FROM reward_challenges WHERE id = ?')
    .bind(id)
    .first()) as RewardChallengeRow | null;
}

async function getChallengeByTransaction(
  db: D1Database,
  transactionId: string
): Promise<RewardChallengeRow | null> {
  return (await db
    .prepare('SELECT * FROM reward_challenges WHERE transaction_id = ?')
    .bind(transactionId)
    .first()) as RewardChallengeRow | null;
}

function logRewardResult(
  outcome: string,
  verifierCode?: AdmobSsvErrorCode,
  verifierReason?: AdmobSsvVerifierReason,
  verifierField?: AdmobSsvVerifierField
): void {
  console.log({
    event: 'reward_ssv_result',
    outcome,
    ...(verifierCode ? { verifierCode } : {}),
    ...(verifierReason ? { verifierReason } : {}),
    ...(verifierField ? { verifierField } : {})
  });
}

function callbackError(error: unknown): Response {
  if (error instanceof AdmobSsvVerificationError) {
    const status = error.code === 'KEY_FETCH_FAILED' ? 503 : 400;
    return jsonError(status, error.code, 'Reward verification callback was rejected.');
  }
  throw error;
}

function callbackMatchesExisting(
  existing: RewardChallengeRow,
  callback: ParsedAdmobSsvCallback
): boolean {
  return (
    existing.id === callback.fields.customData &&
    existing.user_id === callback.fields.userId &&
    existing.transaction_id === callback.fields.transactionId &&
    existing.ad_unit === callback.fields.adUnit &&
    existing.callback_timestamp_ms === callback.fields.timestampMs
  );
}

export function registerRewardRoutes<E extends RewardEnv>(
  app: Hono<BindingsFor<E>>,
  dependencies: RewardRouteDependencies = {}
): void {
  const nowMs = dependencies.nowMs ?? Date.now;
  const randomUUID = dependencies.randomUUID ?? crypto.randomUUID;
  const verifyCallback = dependencies.verifyCallback ?? verifyAdmobSsvCallback;

  app.post('/rewards/prepare', async (c) => {
    const body = validateRewardPrepareBody(await c.req.json());
    const auth = c.get('auth');
    const allowed = await enforceRateLimit(
      c.env,
      `reward-prepare:${auth.userId}`,
      PREPARE_RATE_LIMIT,
      PREPARE_RATE_WINDOW_SECONDS
    );
    if (!allowed) {
      return jsonError(429, 'RATE_LIMITED', 'Too many reward preparation attempts.');
    }
    const createdAtMs = nowMs();
    if (
      await hasRewardEntitlement(
        c.env.DB,
        auth.userId,
        body.reward_type,
        body.identifier,
        new Date(createdAtMs)
      )
    ) {
      return jsonError(409, 'ALREADY_CLAIMED', 'Reward was already claimed for this content period.');
    }
    const challengeId = randomUUID();
    const expiresAtMs = createdAtMs + CHALLENGE_TTL_MS;

    await c.env.DB
      .prepare(
        `INSERT INTO reward_challenges
         (id, user_id, reward_type, identifier, status, transaction_id, ad_unit,
          callback_timestamp_ms, created_at, expires_at, verified_at, consumed_at,
          entitlement_expires_at)
         VALUES (?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?, NULL, NULL, NULL)`
      )
      .bind(
        challengeId,
        auth.userId,
        body.reward_type,
        body.identifier,
        iso(createdAtMs),
        iso(expiresAtMs)
      )
      .run();

    return c.json(
      {
        challenge_id: challengeId,
        custom_data: challengeId,
        user_id: auth.userId,
        reward_type: body.reward_type,
        identifier: body.identifier,
        expires_at: iso(expiresAtMs)
      },
      201
    );
  });

  app.get('/rewards/ssv', async (c) => {
    let callback: ParsedAdmobSsvCallback;
    try {
      callback = await verifyCallback(c.req.url);
    } catch (error) {
      const verifierCode = error instanceof AdmobSsvVerificationError ? error.code : undefined;
      const verifierReason =
        error instanceof AdmobSsvVerificationError ? error.reason ?? undefined : undefined;
      const verifierField =
        error instanceof AdmobSsvVerificationError ? error.field ?? undefined : undefined;
      logRewardResult('signature_rejected', verifierCode, verifierReason, verifierField);
      return callbackError(error);
    }

    const challengeId = callback.fields.customData;
    const transactionId = callback.fields.transactionId;
    const duplicateTransaction = await getChallengeByTransaction(c.env.DB, transactionId);
    if (duplicateTransaction) {
      if (callbackMatchesExisting(duplicateTransaction, callback)) {
        logRewardResult('duplicate_callback');
        return c.json({ ok: true, duplicate: true });
      }
      logRewardResult('transaction_replay');
      return jsonError(409, 'TRANSACTION_REPLAY', 'Reward transaction was already used.');
    }

    const challenge = await getChallenge(c.env.DB, challengeId);
    if (!challenge) {
      logRewardResult('unknown_challenge');
      return jsonError(404, 'REWARD_CHALLENGE_NOT_FOUND', 'Reward challenge was not found.');
    }

    const currentMs = nowMs();
    if (challenge.expires_at <= iso(currentMs)) {
      logRewardResult('expired_challenge');
      return jsonError(410, 'REWARD_CHALLENGE_EXPIRED', 'Reward challenge expired.');
    }
    if (callback.fields.userId !== challenge.user_id) {
      logRewardResult('user_mismatch');
      return jsonError(400, 'REWARD_USER_MISMATCH', 'Reward callback user does not match.');
    }
    if (normalizeAdUnitId(callback.fields.adUnit) !== normalizeAdUnitId(c.env.ADMOB_REWARDED_ID)) {
      logRewardResult('ad_unit_mismatch');
      return jsonError(400, 'REWARD_AD_UNIT_MISMATCH', 'Reward callback ad unit does not match.');
    }
    if (
      callback.fields.timestampMs < currentMs - CALLBACK_PAST_SKEW_MS ||
      callback.fields.timestampMs > currentMs + CALLBACK_FUTURE_SKEW_MS
    ) {
      logRewardResult('timestamp_rejected');
      return jsonError(400, 'REWARD_TIMESTAMP_INVALID', 'Reward callback timestamp is outside the allowed window.');
    }

    const verifiedAt = iso(currentMs);
    let result: D1Result<unknown>;
    try {
      result = await c.env.DB
        .prepare(
          `UPDATE reward_challenges
           SET status = 'verified', transaction_id = ?, ad_unit = ?, callback_timestamp_ms = ?, verified_at = ?
           WHERE id = ? AND status = 'pending' AND transaction_id IS NULL AND expires_at > ?`
        )
        .bind(
          transactionId,
          callback.fields.adUnit,
          callback.fields.timestampMs,
          verifiedAt,
          challengeId,
          verifiedAt
        )
        .run();
    } catch (error) {
      console.error('Reward SSV verification update failed.', {
        error: error instanceof Error ? error.message : 'unknown database error'
      });
      const transactionOwner = await getChallengeByTransaction(c.env.DB, transactionId);
      if (transactionOwner && transactionOwner.id !== challengeId) {
        logRewardResult('transaction_replay');
        return jsonError(409, 'TRANSACTION_REPLAY', 'Reward transaction was already used.');
      }
      logRewardResult('verification_conflict');
      return jsonError(409, 'REWARD_VERIFICATION_CONFLICT', 'Reward challenge could not be verified.');
    }

    if ((result.meta.changes ?? 0) !== 1) {
      const current = await getChallenge(c.env.DB, challengeId);
      if (current && callbackMatchesExisting(current, callback)) {
        logRewardResult('duplicate_callback');
        return c.json({ ok: true, duplicate: true });
      }
      const transactionOwner = await getChallengeByTransaction(c.env.DB, transactionId);
      if (transactionOwner && transactionOwner.id !== challengeId) {
        logRewardResult('transaction_replay');
        return jsonError(409, 'TRANSACTION_REPLAY', 'Reward transaction was already used.');
      }
      logRewardResult('verification_conflict');
      return jsonError(409, 'REWARD_VERIFICATION_CONFLICT', 'Reward challenge could not be verified.');
    }

    logRewardResult('verified');
    return c.json({ ok: true, duplicate: false });
  });

  app.post('/rewards/claim', async (c) => {
    const body = validateRewardClaimBody(await c.req.json());
    const auth = c.get('auth');
    const challenge = await getChallenge(c.env.DB, body.challenge_id);

    if (!challenge || challenge.user_id !== auth.userId) {
      return jsonError(404, 'REWARD_CHALLENGE_NOT_FOUND', 'Reward challenge was not found.');
    }

    const currentMs = nowMs();
    const currentIso = iso(currentMs);
    if (challenge.status === 'consumed') {
      if (challenge.entitlement_expires_at && challenge.entitlement_expires_at > currentIso) {
        return c.json({
          ok: true,
          duplicate: true,
          challenge_id: challenge.id,
          reward_type: challenge.reward_type,
          identifier: challenge.identifier,
          entitlement_expires_at: challenge.entitlement_expires_at
        });
      }
      return jsonError(410, 'REWARD_ENTITLEMENT_EXPIRED', 'Reward entitlement expired.');
    }
    if (challenge.expires_at <= currentIso) {
      return jsonError(410, 'REWARD_CHALLENGE_EXPIRED', 'Reward challenge expired.');
    }
    if (challenge.status === 'pending') {
      return jsonError(409, 'PENDING_VERIFICATION', 'Reward callback has not been verified yet.');
    }

    const entitlementExpiresAt = iso(currentMs + entitlementTtlMs(challenge.reward_type));
    const result = await c.env.DB
      .prepare(
        `UPDATE reward_challenges
         SET status = 'consumed', consumed_at = ?, entitlement_expires_at = ?
         WHERE id = ? AND user_id = ? AND status = 'verified' AND expires_at > ?`
      )
      .bind(currentIso, entitlementExpiresAt, challenge.id, auth.userId, currentIso)
      .run();

    if ((result.meta.changes ?? 0) !== 1) {
      const current = await getChallenge(c.env.DB, challenge.id);
      if (
        current?.status === 'consumed' &&
        current.user_id === auth.userId &&
        current.entitlement_expires_at &&
        current.entitlement_expires_at > currentIso
      ) {
        return c.json({
          ok: true,
          duplicate: true,
          challenge_id: current.id,
          reward_type: current.reward_type,
          identifier: current.identifier,
          entitlement_expires_at: current.entitlement_expires_at
        });
      }
      return jsonError(409, 'REWARD_CLAIM_CONFLICT', 'Reward challenge could not be consumed.');
    }

    return c.json({
      ok: true,
      duplicate: false,
      challenge_id: challenge.id,
      reward_type: challenge.reward_type,
      identifier: challenge.identifier,
      entitlement_expires_at: entitlementExpiresAt
    });
  });
}

export async function hasRewardEntitlement(
  db: D1Database,
  userId: string,
  rewardType: RewardType,
  identifier: string,
  now = new Date()
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM reward_challenges
       WHERE user_id = ? AND reward_type = ? AND identifier = ?
         AND status = 'consumed' AND entitlement_expires_at > ?
       LIMIT 1`
    )
    .bind(userId, rewardType, identifier, now.toISOString())
    .first<{ id: string }>();
  return Boolean(row);
}


const REWARD_CLEANUP_BATCH_SIZE = 500;

export async function cleanupRewardChallenges(
  db: D1Database,
  nowMs: number = Date.now()
): Promise<void> {
  const auditCutoff = new Date(nowMs - 30 * 24 * 60 * 60 * 1_000).toISOString();
  while (true) {
    const result = await db
      .prepare(
        `DELETE FROM reward_challenges
         WHERE id IN (
           SELECT id FROM reward_challenges
           WHERE expires_at < ?
             AND (entitlement_expires_at IS NULL OR entitlement_expires_at < ?)
           LIMIT ?
         )`
      )
      .bind(auditCutoff, auditCutoff, REWARD_CLEANUP_BATCH_SIZE)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      break;
    }
  }
}
