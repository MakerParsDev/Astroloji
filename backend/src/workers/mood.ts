import { Hono } from 'hono';

import { getMoodInsight, logMood } from '@/services/mood';
import type { AppBindings } from '@/types';
import { validateMoodLogBody } from '@/utils/validators';

export function registerMoodRoutes(app: Hono<AppBindings>): void {
  app.post('/mood/log', async (c) => {
    const auth = c.get('auth');
    const body = validateMoodLogBody(await c.req.json().catch(() => ({})));
    const result = await logMood(c.env.DB, auth.userId, body.mood, body.domain ?? null);
    return c.json({ date: result.date, mood: result.mood, domain: result.domain });
  });

  app.get('/mood/insight', async (c) => {
    const auth = c.get('auth');
    const insight = await getMoodInsight(c.env, auth.userId);
    return c.json({ insight });
  });
}
