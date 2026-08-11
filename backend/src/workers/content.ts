import { Hono } from 'hono';

import { enhanceDailyUploadsWithLlm } from '@/llm/dailyContentEnhancer';
import { buildDailyContentProviderChain } from '@/llm/dailyContentProviderChain';
import { requireAdminCapability } from '@/middleware/auth';
import { getCachedJsonContent } from '@/services/cache';
import { assertSeedQuality, buildDocumentsForSeed } from '@/utils/contentSeed';
import type { ContentSeedOptions, ContentSeedUpload } from '@/utils/contentSeed';
import type {
  AppBindings,
  CompatibilityContentDocument,
  ContentBackfillRequest,
  DailyContentDocument,
  DailySignContent,
  Language,
  MonthlyContentDocument,
  MonthlySignContent,
  PersonalityContentDocument,
  WeeklyContentDocument,
  WeeklySignContent
} from '@/types';
import { getDateIdentifier, getMonthIdentifier, getWeekIdentifier } from '@/utils/date';
import { hasRewardEntitlement } from '@/workers/reward';
import {
  normalizeCompatibilityPair,
  validateContentBackfillBody,
  validateLanguage,
  validateSign
} from '@/utils/validators';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function backfillContentDocuments(
  env: AppBindings['Bindings'],
  request: ContentBackfillRequest,
  buildDocuments: (options: ContentSeedOptions) => ContentSeedUpload[] = buildDocumentsForSeed
) {
  const uploads = buildDocuments({
    seedDate: request.seed_date,
    dailyDays: request.daily_days,
    skipStaticContent: request.skip_static_content,
    language: request.language
  });
  assertSeedQuality(uploads);

  const enhancedUploads = await enhanceDailyUploadsWithLlm(env, buildDailyContentProviderChain(env), uploads);

  const approvedAt = new Date().toISOString();
  const approvedUploads = enhancedUploads.map((item) => ({
    ...item,
    payload: {
      ...(item.payload as Record<string, unknown>),
      editorial_status: request.editorial_status,
      approved_by: request.approved_by,
      approval_reference: request.approval_reference,
      approved_at: approvedAt
    }
  }));

  for (const item of approvedUploads) {
    await env.CONTENT.put(item.key, JSON.stringify(item.payload, null, 2), {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8'
      }
    });
  }

  return approvedUploads;
}

export function filterDailyContent(content: DailySignContent, isPremium: boolean) {
  if (isPremium) {
    return content;
  }

  return {
    short: content.short,
    lucky_number: content.lucky_number,
    lucky_color: content.lucky_color,
    energy: content.energy,
    love_score: content.love_score,
    career_score: content.career_score,
    money_score: content.money_score,
    health_score: content.health_score
  };
}

export function filterWeeklyContent(content: WeeklySignContent, isPremium: boolean) {
  return isPremium ? content : { summary: content.summary };
}

export function filterMonthlyContent(content: MonthlySignContent, isPremium: boolean) {
  return isPremium ? content : { summary: content.summary };
}

export function filterCompatibilityContent(
  content: CompatibilityContentDocument,
  isPremium: boolean
) {
  if (isPremium) {
    return content;
  }

  return {
    overall_score: content.overall_score,
    summary: content.summary
  };
}

export function filterPersonalityContent(content: PersonalityContentDocument, isPremium: boolean) {
  if (isPremium) {
    return content;
  }

  return {
    summary: content.summary,
    element: content.element,
    planet: content.planet,
    color: content.color,
    stone: content.stone
  };
}

export function registerContentRoutes(app: Hono<AppBindings>) {
  app.get('/content/daily', async (c) => {
    const sign = validateSign(c.req.query('sign') ?? '');
    const language = validateLanguage(c.req.query('lang') ?? 'tr');
    const date = c.req.query('date') ?? getDateIdentifier();

    const document = await getCachedJsonContent<DailyContentDocument>(c.env, {
      language,
      type: 'daily',
      identifier: date,
      r2Key: `content/daily/${language}/${date}.json`,
      bypassCache: c.get('bypassCache')
    });

    if (!document) {
      return jsonError(404, 'CONTENT_NOT_FOUND', 'Daily content was not found.');
    }

    const canAccessPremiumFields =
      c.get('auth').isPremium ||
      (await hasRewardEntitlement(c.env.DB, c.get('auth').userId, 'daily', date));

    return c.json({
      date: document.date,
      language,
      sign,
      ...filterDailyContent(document.signs[sign], canAccessPremiumFields)
    });
  });

  app.get('/content/weekly', async (c) => {
    const sign = validateSign(c.req.query('sign') ?? '');
    const language = validateLanguage(c.req.query('lang') ?? 'tr');
    const week = c.req.query('week') ?? getWeekIdentifier();

    const document = await getCachedJsonContent<WeeklyContentDocument>(c.env, {
      language,
      type: 'weekly',
      identifier: week,
      r2Key: `content/weekly/${language}/${week}.json`,
      bypassCache: c.get('bypassCache')
    });

    if (!document) {
      return jsonError(404, 'CONTENT_NOT_FOUND', 'Weekly content was not found.');
    }

    const canAccessPremiumFields =
      c.get('auth').isPremium ||
      (await hasRewardEntitlement(c.env.DB, c.get('auth').userId, 'weekly', week));

    return c.json({
      week: document.week,
      week_start: document.week_start,
      week_end: document.week_end,
      language,
      sign,
      ...filterWeeklyContent(document.signs[sign], canAccessPremiumFields)
    });
  });

  app.get('/content/monthly', async (c) => {
    const sign = validateSign(c.req.query('sign') ?? '');
    const language = validateLanguage(c.req.query('lang') ?? 'tr');
    const month = c.req.query('month') ?? getMonthIdentifier();

    const document = await getCachedJsonContent<MonthlyContentDocument>(c.env, {
      language,
      type: 'monthly',
      identifier: month,
      r2Key: `content/monthly/${language}/${month}.json`,
      bypassCache: c.get('bypassCache')
    });

    if (!document) {
      return jsonError(404, 'CONTENT_NOT_FOUND', 'Monthly content was not found.');
    }

    return c.json({
      month: document.month,
      month_start: document.month_start,
      month_end: document.month_end,
      language,
      sign,
      ...filterMonthlyContent(document.signs[sign], c.get('auth').isPremium)
    });
  });

  app.get('/content/personality', async (c) => {
    const sign = validateSign(c.req.query('sign') ?? '');
    const language = validateLanguage(c.req.query('lang') ?? 'tr');

    const document = await getCachedJsonContent<PersonalityContentDocument>(c.env, {
      language,
      type: 'personality',
      identifier: sign,
      r2Key: `content/personality/${language}/${sign}.json`,
      bypassCache: c.get('bypassCache')
    });

    if (!document) {
      return jsonError(404, 'CONTENT_NOT_FOUND', 'Personality content was not found.');
    }

    return c.json({
      sign,
      language,
      ...filterPersonalityContent(document, c.get('auth').isPremium)
    });
  });

  app.get('/content/compat', async (c) => {
    const language = validateLanguage(c.req.query('lang') ?? 'tr');
    const sign1 = c.req.query('sign1') ?? '';
    const sign2 = c.req.query('sign2') ?? '';
    const normalized = normalizeCompatibilityPair(sign1, sign2);

    const document = await getCachedJsonContent<CompatibilityContentDocument>(c.env, {
      language,
      type: 'compat',
      identifier: normalized.key,
      r2Key: `content/compat/${language}/${normalized.key}.json`,
      bypassCache: c.get('bypassCache')
    });

    if (!document) {
      return jsonError(404, 'CONTENT_NOT_FOUND', 'Compatibility content was not found.');
    }

    return c.json({
      sign1: normalized.normalizedSign1,
      sign2: normalized.normalizedSign2,
      language,
      ...filterCompatibilityContent(document, c.get('auth').isPremium)
    });
    }
  );
}

export function registerContentAdminRoutes(app: Hono<AppBindings>) {
  app.post(
    '/admin/content/backfill',
    requireAdminCapability('content-ops', 'content.backfill'),
    async (c) => {
    const request = validateContentBackfillBody(await c.req.json());
    const uploads = await backfillContentDocuments(c.env, request);

    return c.json({
      ok: true,
      uploaded: uploads.length,
      seed_date: request.seed_date ?? null,
      daily_days: request.daily_days,
      skip_static_content: request.skip_static_content,
      editorial_status: request.editorial_status,
      approved_by: request.approved_by,
      approval_reference: request.approval_reference,
      sample_keys: uploads.slice(0, 5).map((item) => item.key)
    });
  });
}
