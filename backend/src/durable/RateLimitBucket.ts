import { DurableObject } from 'cloudflare:workers';

import type { Env } from '@/types';

export class RateLimitBucket extends DurableObject<Env> {}
