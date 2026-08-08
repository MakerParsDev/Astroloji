import { DurableObject } from 'cloudflare:workers';

import {
  claimRateLimitWindow,
  type RateLimitDecision,
  type RateLimitPolicyInput
} from '@/services/rateLimit';
import type { Env } from '@/types';

export class RateLimitBucket extends DurableObject<Env> {
  check(input: RateLimitPolicyInput): Promise<RateLimitDecision> {
    return claimRateLimitWindow(this.ctx.storage, Date.now(), input);
  }
}
