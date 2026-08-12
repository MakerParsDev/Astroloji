import type { Hono } from 'hono';

import { buildDailyContentProviderChain } from '@/llm/dailyContentProviderChain';
import type { LlmGenerateRequest } from '@/llm/provider';
import { buildReadingProviderChain } from '@/llm/readingProviderChain';
import { routeLlmGenerate } from '@/llm/router';
import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings, AppContext } from '@/types';
import { validateAdminPanelLlmTestBody, type AdminPanelLlmTestRequest } from '@/utils/validators';

const ADMIN_PANEL_HEALTH_CACHE_KEY = 'admin_panel_health_canary';

const ADMIN_PANEL_LLM_TEST_MESSAGE = {
  system: 'You are a connectivity check. Reply with exactly one lowercase word and nothing else.',
  user: 'Reply with the word: ok'
};

const ADMIN_PANEL_LLM_TEST_PROMPTS: Record<AdminPanelLlmTestRequest['taskType'], LlmGenerateRequest> = {
  daily_content: {
    taskType: 'daily_content',
    messages: [
      { role: 'system', content: ADMIN_PANEL_LLM_TEST_MESSAGE.system },
      { role: 'user', content: ADMIN_PANEL_LLM_TEST_MESSAGE.user }
    ],
    maxOutputTokens: 16
  },
  deep_reading: {
    taskType: 'deep_reading',
    messages: [
      { role: 'system', content: ADMIN_PANEL_LLM_TEST_MESSAGE.system },
      { role: 'user', content: ADMIN_PANEL_LLM_TEST_MESSAGE.user }
    ],
    maxOutputTokens: 16
  },
  chat_consultation: {
    taskType: 'chat_consultation',
    messages: [
      { role: 'system', content: ADMIN_PANEL_LLM_TEST_MESSAGE.system },
      { role: 'user', content: ADMIN_PANEL_LLM_TEST_MESSAGE.user }
    ],
    maxOutputTokens: 16
  }
};

async function checkDb(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return row?.ok === 1;
  } catch {
    return false;
  }
}

async function checkKv(cache: KVNamespace): Promise<boolean> {
  try {
    await cache.put(ADMIN_PANEL_HEALTH_CACHE_KEY, '1', { expirationTtl: 60 });
    return true;
  } catch {
    return false;
  }
}

function providerChainIds(c: AppContext) {
  const readingIds = buildReadingProviderChain(c.env).map((provider) => provider.id);
  return {
    daily_content: buildDailyContentProviderChain(c.env).map((provider) => provider.id),
    deep_reading: readingIds,
    chat_consultation: readingIds
  };
}

export function registerAdminPanelRoutes(app: Hono<AppBindings>) {
  app.get('/admin/panel/health', requireAdminPanelAuth('panel.health'), async (c) => {
    const [dbOk, kvOk] = await Promise.all([checkDb(c.env.DB), checkKv(c.env.CACHE)]);

    return c.json({
      status: dbOk && kvOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbOk,
      kv: kvOk,
      llmProviders: providerChainIds(c)
    });
  });

  app.post('/admin/panel/llm/test', requireAdminPanelAuth('panel.llm_test'), async (c) => {
    const body = validateAdminPanelLlmTestBody(await c.req.json());
    const providers =
      body.taskType === 'daily_content'
        ? buildDailyContentProviderChain(c.env)
        : buildReadingProviderChain(c.env);
    const routed = await routeLlmGenerate(providers, ADMIN_PANEL_LLM_TEST_PROMPTS[body.taskType]);

    return c.json({
      succeeded: routed.result !== null,
      providerId: routed.result?.providerId ?? null,
      text: routed.result?.text ?? null,
      usage: routed.result?.usage ?? null,
      attempts: routed.attempts
    });
  });
}
