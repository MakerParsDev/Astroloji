import { Hono } from 'hono';

import { createNatalChart } from '@/chart-engine/natalChart';
import { generateDeepReading } from '@/llm/deepReadingGenerator';
import { buildReadingProviderChain } from '@/llm/readingProviderChain';
import { enforceStrictRateLimit, mapStrictRateLimitResult } from '@/services/rateLimit';
import { buildChartFingerprint, deriveChartReadingSummary } from '@/services/chartReadingSummary';
import { getCreditBalance, spendCredits } from '@/services/credits';
import type { AppBindings } from '@/types';
import { validateDeepReadingBody } from '@/utils/validators';
import { getDecryptedBirthData } from '@/workers/birthData';

const DEEP_READING_CREDIT_COST = 30;
const READING_RATE_LIMIT = 5;
const READING_RATE_WINDOW_SECONDS = 3600;

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function storedDeepReadingKey(userId: string, chartFingerprint: string): string {
  return `deep-reading/${userId}/${chartFingerprint}.txt`;
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
      return c.json({ text: await stored.text(), cached: true, credits_spent: 0 });
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

    let creditsSpent = 0;
    if (!auth.isPremium) {
      const spend = await spendCredits(c.env.DB, {
        id: crypto.randomUUID(),
        userId: auth.userId,
        amount: DEEP_READING_CREDIT_COST,
        feature: 'deep_reading',
        createdAt: new Date().toISOString()
      });
      if (spend.status === 'insufficient_balance') {
        return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits for a deep reading.');
      }
      creditsSpent = DEEP_READING_CREDIT_COST;
    }

    await c.env.CONTENT.put(storageKey, text);
    return c.json({ text, cached: false, credits_spent: creditsSpent });
  });
}
