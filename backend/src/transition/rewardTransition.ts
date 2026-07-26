import type { RewardType } from '@/types';
import {
  isValidRewardIdentifier,
  rewardClaimSchema
} from '@/utils/validators';

export type RewardRequestDecision =
  | { kind: 'local' }
  | { kind: 'forward'; body: Uint8Array }
  | { kind: 'reject'; response: Response };

type LegacyRewardClaim = {
  reward_type: RewardType;
  identifier: string;
};

function reject(status: number, code: string, message: string): RewardRequestDecision {
  return {
    kind: 'reject',
    response: Response.json({ error: { code, message } }, { status })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChallengeClaim(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    return false;
  }
  return rewardClaimSchema.safeParse(value).success;
}

export function isExactLegacyRewardClaim(value: unknown): value is LegacyRewardClaim {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'identifier' || keys[1] !== 'reward_type') {
    return false;
  }

  const rewardType = value.reward_type;
  const identifier = value.identifier;
  if ((rewardType !== 'daily' && rewardType !== 'weekly') || typeof identifier !== 'string') {
    return false;
  }

  return isValidRewardIdentifier(rewardType, identifier);
}

export async function classifyRewardRequest(
  request: Request,
  nowMs: number,
  legacyForwardUntil: string
): Promise<RewardRequestDecision> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/rewards/')) {
    return reject(404, 'NOT_FOUND', 'Route is not served by the transition Worker.');
  }

  if (url.pathname === '/api/v1/rewards/prepare' && request.method === 'POST') {
    return { kind: 'local' };
  }

  if (url.pathname === '/api/v1/rewards/ssv' && request.method === 'GET') {
    return { kind: 'local' };
  }

  if (url.pathname !== '/api/v1/rewards/claim' || request.method !== 'POST') {
    return reject(405, 'METHOD_NOT_ALLOWED', 'Reward route or method is not supported.');
  }

  const body = new Uint8Array(await request.clone().arrayBuffer());
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return reject(400, 'INVALID_REQUEST', 'Request body must be valid JSON.');
  }

  if (isChallengeClaim(parsed)) {
    return { kind: 'local' };
  }

  if (!isExactLegacyRewardClaim(parsed)) {
    return reject(400, 'INVALID_REQUEST', 'Reward claim payload is invalid.');
  }

  const deadlineMs = Date.parse(legacyForwardUntil);
  if (!Number.isFinite(deadlineMs)) {
    return reject(
      503,
      'LEGACY_FORWARDING_NOT_CONFIGURED',
      'Legacy reward forwarding is unavailable.'
    );
  }

  if (nowMs >= deadlineMs) {
    return reject(410, 'LEGACY_REWARD_FLOW_EXPIRED', 'Legacy reward flow has expired.');
  }

  return { kind: 'forward', body };
}
