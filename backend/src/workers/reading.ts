import { Hono } from 'hono';

import { createNatalChart } from '@/chart-engine/natalChart';
import { generateDeepReading } from '@/llm/deepReadingGenerator';
import { buildReadingProviderChain } from '@/llm/readingProviderChain';
import { enforceStrictRateLimit, mapStrictRateLimitResult } from '@/services/rateLimit';
import { buildChartFingerprint, deriveChartReadingSummary } from '@/services/chartReadingSummary';
import { getCreditBalance, spendCreditsOnce } from '@/services/credits';
import type { AppBindings } from '@/types';
import { validateDeepReadingBody } from '@/utils/validators';
import { getDecryptedBirthData } from '@/workers/birthData';

const DEEP_READING_CREDIT_COST = 30;
const READING_RATE_LIMIT = 5;
const READING_RATE_WINDOW_SECONDS = 3600;
const CHARGED_READING_VERSION = 'credit-v2';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function storedDeepReadingKey(userId: string, chartFingerprint: string): string {
  return `deep-reading/${userId}/${chartFingerprint}.txt`;
}

async function authorizeStoredReading(
  db: D1Database,
  userId: string,
  storageKey: string
): Promise<'spent' | 'already_spent' | 'insufficient_balance'> {
  const result = await spendCreditsOnce(db, {
    // One immutable charge ID per stored reading, independent of retries or concurrent requests.
    id: `deep-reading:${storageKey}`,
    userId,
    amount: DEEP_READING_CREDIT_COST,
    feature: 'deep_reading',
    createdAt: new Date().toISOString()
  });
  return result.status;
}

export function registerReadingRoutes(app: Hono<AppBindings>): void {
  app.post('/reading/deep', async (c) => {
    const auth = c.get('auth');
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'reading-deep', auth.userId, READING_RATE_LIMIT, READING_RATE_WINDOW_SECONDS)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const body = validateDeepReadingBody(await c.req.json().catch(() => ({})));

    const birthData = await getDecryptedBirthData(c.env, auth.userId);
    if (!birthData) {
      return jsonError(
        400,
        'BIRTH_DATA_REQUIRED',
        'Save your birth date, time, and city before requesting a deep reading.'
      );
    }

    const fingerprint = await buildChartFingerprint(
      birthData.plaintext.timestamp,
      birthData.plaintext.latitude,
      birthData.plaintext.longitude
    );
    const storageKey = storedDeepReadingKey(auth.userId, fingerprint);

    const stored = await c.env.CONTENT.get(storageKey);
    if (stored) {
      // Older objects were charged before R2 write; never charge legacy readers again.
      const paymentRequired = !auth.isPremium &&
        stored.customMetadata?.billingVersion === CHARGED_READING_VERSION;
      const charge = paymentRequired
        ? await authorizeStoredReading(c.env.DB, auth.userId, storageKey)
        : 'already_spent';
      if (charge === 'insufficient_balance') {
        return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits for a deep reading.');
      }
      return c.json({
        text: await stored.text(),
        cached: true,
        credits_spent: charge === 'spent' ? DEEP_READING_CREDIT_COST : 0
      });
    }

    if (!auth.isPremium) {
      const balance = await getCreditBalance(c.env.DB, auth.userId);
      if (balance < DEEP_READING_CREDIT_COST) {
        return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits for a deep reading.');
      }
    }

    const chart = createNatalChart({
      timestamp: birthData.plaintext.timestamp,
      timeCertainty: birthData.timeCertainty,
      observer: { latitude: birthData.plaintext.latitude, longitude: birthData.plaintext.longitude }
    });

    const providers = buildReadingProviderChain(c.env);
    const { text } = await generateDeepReading(providers, {
      chart: deriveChartReadingSummary(chart),
      language: body.language
    });
    if (!text) {
      return jsonError(
        503,
        'DEEP_READING_UNAVAILABLE',
        'Deep reading could not be generated right now. Try again shortly.'
      );
    }

    // Conditional create ensures parallel requests cannot overwrite one another's reading.
    // An R2 error cannot consume credits because the debit happens only after persistence.
    let created;
    try {
      created = await c.env.CONTENT.put(storageKey, text, {
        onlyIf: new Headers({ 'If-None-Match': '*' }),
        customMetadata: auth.isPremium ? {} : { billingVersion: CHARGED_READING_VERSION }
      });
    } catch {
      return jsonError(503, 'READING_STORAGE_UNAVAILABLE', 'Reading could not be saved. Try again shortly.');
    }

    // If another request created it, use that immutable object, not this generated candidate.
    const concurrentStored = created === null ? await c.env.CONTENT.get(storageKey) : null;
    if (created === null && !concurrentStored) {
      return jsonError(503, 'READING_STORAGE_UNAVAILABLE', 'Reading could not be saved. Try again shortly.');
    }
    const actual = concurrentStored ? await concurrentStored.text() : text;
    const paymentRequired = !auth.isPremium && (concurrentStored
      ? concurrentStored.customMetadata?.billingVersion === CHARGED_READING_VERSION
      : true);
    const charge = paymentRequired
      ? await authorizeStoredReading(c.env.DB, auth.userId, storageKey)
      : 'already_spent';
    if (charge === 'insufficient_balance') {
      // Leave the unread staged object for an authenticated retry after top-up.
      // It is not served for free, and repeated retries do not regenerate the LLM output.
      return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits for a deep reading.');
    }

    return c.json({
      text: actual,
      cached: concurrentStored !== null,
      credits_spent: charge === 'spent' ? DEEP_READING_CREDIT_COST : 0
    });
  });
}
