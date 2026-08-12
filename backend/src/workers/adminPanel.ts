import type { Hono } from 'hono';

import { buildDailyContentProviderChain } from '@/llm/dailyContentProviderChain';
import { buildReadingProviderChain } from '@/llm/readingProviderChain';
import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings, AppContext } from '@/types';

const ADMIN_PANEL_HEALTH_CACHE_KEY = 'admin_panel_health_canary';

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
    return (await cache.get(ADMIN_PANEL_HEALTH_CACHE_KEY)) === '1';
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
}
