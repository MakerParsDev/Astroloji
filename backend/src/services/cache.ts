import { CONTENT_TYPES } from '@/types';
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

/**
 * Parses the {@link ContentType}, language, and identifier back out of an
 * R2 object key of the form `content/{type}/{language}/{identifier}.json`,
 * matching the layout `buildDocumentsForSeed` (contentSeed.ts) writes.
 * Returns null for any key that doesn't match, rather than throwing --
 * callers use this to opportunistically invalidate a cache entry and
 * should not fail a write because of it.
 */
export function parseContentR2Key(
  r2Key: string
): { type: ContentType; language: string; identifier: string } | null {
  const match = /^content\/([a-z]+)\/([a-z]+)\/(.+)\.json$/.exec(r2Key);
  if (!match) {
    return null;
  }
  const [, type, language, identifier] = match;
  if (!(CONTENT_TYPES as readonly string[]).includes(type)) {
    return null;
  }
  return { type: type as ContentType, language, identifier };
}

/**
 * Deletes the KV read-cache entry for an R2 content object, so a write that
 * corrects already-cached content (e.g. an admin content backfill) is
 * visible to readers immediately instead of only after the cache TTL
 * expires (up to 27 days for monthly content). Safe to call for keys that
 * aren't cached yet -- KV delete of a missing key is a no-op.
 */
export async function invalidateContentCache(env: Env, r2Key: string): Promise<void> {
  const parsed = parseContentR2Key(r2Key);
  if (!parsed) {
    return;
  }
  await env.CACHE.delete(buildContentCacheKey(parsed.language, parsed.type, parsed.identifier));
}
