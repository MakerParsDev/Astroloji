import { Hono } from 'hono';

import { createNatalChart } from '@/chart-engine/natalChart';
import { generateChatReply } from '@/llm/chatConsultationGenerator';
import { buildReadingProviderChain } from '@/llm/readingProviderChain';
import { enforceStrictRateLimit, mapStrictRateLimitResult } from '@/services/rateLimit';
import { deriveChartReadingSummary } from '@/services/chartReadingSummary';
import { getCreditBalance, spendCredits } from '@/services/credits';
import type { AppBindings } from '@/types';
import { validateChatMessageBody } from '@/utils/validators';
import { getDecryptedBirthData } from '@/workers/birthData';

const CHAT_MESSAGE_CREDIT_COST = 5;
const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_SECONDS = 3600;

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export function registerChatRoutes(app: Hono<AppBindings>): void {
  app.post('/chat/message', async (c) => {
    const userId = c.get('auth').userId;
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'chat-message', userId, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_SECONDS)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const body = validateChatMessageBody(await c.req.json());

    const balance = await getCreditBalance(c.env.DB, userId);
    if (balance < CHAT_MESSAGE_CREDIT_COST) {
      return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits to send a message.');
    }

    const birthData = await getDecryptedBirthData(c.env, userId);
    if (!birthData) {
      return jsonError(
        400,
        'BIRTH_DATA_REQUIRED',
        'Save your birth date, time, and city before starting a consultation.'
      );
    }

    const chart = createNatalChart({
      timestamp: birthData.plaintext.timestamp,
      timeCertainty: birthData.timeCertainty,
      observer: { latitude: birthData.plaintext.latitude, longitude: birthData.plaintext.longitude }
    });

    const providers = buildReadingProviderChain(c.env);
    const { reply } = await generateChatReply(providers, {
      chart: deriveChartReadingSummary(chart),
      language: body.language,
      history: body.history,
      message: body.message
    });
    if (!reply) {
      return jsonError(503, 'CHAT_UNAVAILABLE', 'The consultation is unavailable right now. Try again shortly.');
    }

    const spend = await spendCredits(c.env.DB, {
      id: crypto.randomUUID(),
      userId,
      amount: CHAT_MESSAGE_CREDIT_COST,
      feature: 'chat_consultation',
      createdAt: new Date().toISOString()
    });
    if (spend.status === 'insufficient_balance') {
      return jsonError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits to send a message.');
    }

    return c.json({ reply, balance: spend.balance });
  });
}
