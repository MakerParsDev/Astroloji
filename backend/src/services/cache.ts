import type { ContentType, Env } from '@/types';

const CONTENT_TTLS: Record<ContentType, number> = {
  daily: 60 * 60 * 23,
  weekly: 60 * 60 * 24 * 6,
  monthly: 60 * 60 * 24 * 27,
  compat: 60 * 60 * 24 * 30,
  personality: 60 * 60 * 24 * 30
};

export function buildContentCacheKey(language: string, type: ContentType, identifier: string): string {
  return `content:${language}:${type}:${identifier}`;
}

export function getContentTtl(type: ContentType): number {
  return CONTENT_TTLS[type];
}

export async function getCachedJsonContent<T>(
  env: Env,
  args: {
    language: string;
    type: ContentType;
    identifier: string;
    r2Key: string;
    bypassCache?: boolean;
  }
): Promise<T | null> {
  const key = buildContentCacheKey(args.language, args.type, args.identifier);

  if (!args.bypassCache) {
    const cached = await env.CACHE.get(key, 'json');
    if (cached) {
      return cached as T;
    }
  }

  const object = await env.CONTENT.get(args.r2Key);
  if (!object) {
    return null;
  }

  const payload = (await object.json()) as T;
  await env.CACHE.put(key, JSON.stringify(payload), {
    expirationTtl: getContentTtl(args.type)
  });
  return payload;
}

export async function enforceRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const fullKey = `ratelimit:${key}`;
  const current = Number((await env.CACHE.get(fullKey)) ?? '0');

  if (current >= limit) {
    return false;
  }

  await env.CACHE.put(fullKey, String(current + 1), {
    expirationTtl: windowSeconds
  });
  return true;
}
