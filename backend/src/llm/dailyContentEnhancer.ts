import { SIGNS } from '@/types';
import type { DailyContentDocument, DailySignContent, Env, Sign } from '@/types';
import type { ContentSeedUpload } from '@/utils/contentSeed';

import { buildLlmCacheKey, getCachedLlmText, putCachedLlmText } from './cache';
import { DAILY_CONTENT_PROMPT_VERSION, generateDailySignContent } from './dailyContentGenerator';
import type { LlmProvider } from './provider';

function isDailyContentUpload(upload: ContentSeedUpload): boolean {
  return upload.key.startsWith('content/daily/');
}

interface ResolvedSignContent {
  content: DailySignContent;
  usedLlm: boolean;
}

async function resolveSignContent(
  env: Pick<Env, 'CACHE' | 'CONTENT'>,
  providers: readonly LlmProvider[],
  sign: Sign,
  document: DailyContentDocument
): Promise<ResolvedSignContent> {
  const deterministicFallback = document.signs[sign];
  const cacheKey = await buildLlmCacheKey({
    promptVersion: DAILY_CONTENT_PROMPT_VERSION,
    taskType: 'daily_content',
    // No per-user natal chart exists yet (Faz 0.2) — sign is the whole input
    // to the prompt today, so it stands in as the cache fingerprint. Once
    // birth-data-driven personalization lands, the fingerprint moves to a
    // hash of the user's chart instead of the sign.
    chartFingerprint: sign,
    date: document.date,
    language: document.language
  });

  const cached = await getCachedLlmText(env, cacheKey);
  if (cached) {
    try {
      return { content: JSON.parse(cached) as DailySignContent, usedLlm: true };
    } catch {
      // Corrupt cache entry — fall through and regenerate rather than serving garbage.
    }
  }

  const { content } = await generateDailySignContent(providers, { sign, language: document.language, date: document.date });
  if (!content) {
    // Do not cache a deterministic fallback under the LLM cache key: that
    // would pin today's provider outage into tomorrow's cache read and
    // block ever retrying generation for this (sign, date, language).
    return { content: deterministicFallback, usedLlm: false };
  }

  await putCachedLlmText(env, cacheKey, JSON.stringify(content));
  return { content, usedLlm: true };
}

/**
 * Replaces each sign's deterministic daily content with LLM-generated text
 * when a provider chain is configured. The deterministic content already
 * present in `uploads` (from contentSeed.ts) is both the fallback value and
 * the thing written to R2 whenever generation fails — callers never see an
 * empty result. Non-daily uploads (weekly/monthly/compat/personality) pass
 * through untouched; those stay on the deterministic generator until their
 * own LLM prompts exist.
 *
 * `assertSeedQuality` must run on the deterministic `uploads` *before*
 * calling this function — it validates the fallback baseline, not the
 * LLM-enhanced output (which is validated by its own zod schema in
 * dailyContentGenerator.ts).
 */
export async function enhanceDailyUploadsWithLlm(
  env: Pick<Env, 'CACHE' | 'CONTENT'>,
  providers: readonly LlmProvider[],
  uploads: readonly ContentSeedUpload[]
): Promise<ContentSeedUpload[]> {
  if (providers.length === 0) {
    return [...uploads];
  }

  return Promise.all(
    uploads.map(async (upload): Promise<ContentSeedUpload> => {
      if (!isDailyContentUpload(upload)) {
        return upload;
      }

      const document = upload.payload as DailyContentDocument;
      const resolved = await Promise.all(SIGNS.map((sign) => resolveSignContent(env, providers, sign, document)));

      const signs = Object.fromEntries(
        SIGNS.map((sign, index) => [sign, resolved[index]?.content])
      ) as Record<Sign, DailySignContent>;
      const anyLlm = resolved.some((entry) => entry?.usedLlm);

      return {
        ...upload,
        payload: {
          ...document,
          signs,
          source_signals: anyLlm
            ? Array.from(new Set([...(document.source_signals ?? []), 'llm']))
            : document.source_signals
        }
      };
    })
  );
}
