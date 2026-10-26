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

  // Account-preserving, self-service removal of mood check-ins. A bulk wipe
  // also deletes sanitized D1 mood_logged analytics events. Firebase Analytics
  // already ingested by older clients cannot be retroactively removed here.
  app.delete('/mood/logs', async (c) => {
    const userId = c.get('auth').userId;
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM mood_logs WHERE user_id = ?').bind(userId),
      c.env.DB.prepare(
        "DELETE FROM user_events WHERE user_id = ? AND event_type = 'mood_logged'"
      ).bind(userId)
    ]);
    return c.json({ ok: true });
  });

  // A scoped date removal is useful for individual records. Legacy
  // mood_logged analytics have no attributable mood date: do not guess which
  // aggregate events to delete for this specific calendar date.
  app.delete('/mood/logs/:date', async (c) => {
    const date = c.req.param('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: { code: 'INVALID_REQUEST', message: 'Expected a valid YYYY-MM-DD date.' } }, 400);
    }
    const parsed = new Date(date + 'T00:00:00.000Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return c.json({ error: { code: 'INVALID_REQUEST', message: 'Expected a valid calendar date.' } }, 400);
    }
    await c.env.DB.prepare(
      'DELETE FROM mood_logs WHERE user_id = ? AND date = ?'
    ).bind(c.get('auth').userId, date).run();
    return c.json({ ok: true });
  });

  app.get('/mood/insight', async (c) => {
    const auth = c.get('auth');
    const insight = await getMoodInsight(c.env, auth.userId);
    return c.json({ insight });
  });
}
