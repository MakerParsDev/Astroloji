import { describe, expect, it } from 'vitest';

import {
  buildContentCacheKey,
  invalidateContentCache,
  parseContentR2Key
} from '@/services/cache';
import { createTestEnv } from '../helpers/env';

describe('parseContentR2Key', () => {
  it('parses type, language, and identifier out of a well-formed content R2 key', () => {
    expect(parseContentR2Key('content/monthly/fr/2026-08.json')).toEqual({
      type: 'monthly',
      language: 'fr',
      identifier: '2026-08'
    });
    expect(parseContentR2Key('content/daily/tr/2026-08-11.json')).toEqual({
      type: 'daily',
      language: 'tr',
      identifier: '2026-08-11'
    });
    expect(parseContentR2Key('content/compat/en/aries-leo.json')).toEqual({
      type: 'compat',
      language: 'en',
      identifier: 'aries-leo'
    });
  });

  it('returns null for keys with an unrecognized content type or the wrong shape', () => {
    expect(parseContentR2Key('content/unknown-type/fr/2026-08.json')).toBeNull();
    expect(parseContentR2Key('not-a-content-key.json')).toBeNull();
    expect(parseContentR2Key('content/monthly/fr/2026-08.txt')).toBeNull();
  });
});

describe('invalidateContentCache', () => {
  it('deletes the exact KV key a normal read would have populated', async () => {
    const deleted: string[] = [];
    const env = createTestEnv({
      CACHE: {
        async get() {
          return null;
        },
        async put() {
          return;
        },
        async delete(key: string) {
          deleted.push(key);
        }
      } as unknown as ReturnType<typeof createTestEnv>['CACHE']
    });

    await invalidateContentCache(env, 'content/monthly/fr/2026-08.json');

    expect(deleted).toEqual([buildContentCacheKey('fr', 'monthly', '2026-08')]);
  });

  it('is a no-op for a key that does not match the content R2 layout, rather than throwing', async () => {
    const deleted: string[] = [];
    const env = createTestEnv({
      CACHE: {
        async get() {
          return null;
        },
        async put() {
          return;
        },
        async delete(key: string) {
          deleted.push(key);
        }
      } as unknown as ReturnType<typeof createTestEnv>['CACHE']
    });

    await expect(invalidateContentCache(env, 'not-a-content-key.json')).resolves.toBeUndefined();
    expect(deleted).toEqual([]);
  });
});
