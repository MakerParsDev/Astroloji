import { Hono } from 'hono';

import { checkInStreak } from '@/services/streak';
import type { AppBindings } from '@/types';

export function registerStreakRoutes(app: Hono<AppBindings>): void {
  app.post('/streak/checkin', async (c) => {
    const auth = c.get('auth');
    const result = await checkInStreak(c.env.DB, auth.userId, crypto.randomUUID());
    return c.json({
      streak_count: result.streakCount,
      last_streak_date: result.lastStreakDate,
      milestone_achieved: result.milestoneAchieved,
      credits_granted: result.creditsGranted,
      balance: result.balance
    });
  });
}
