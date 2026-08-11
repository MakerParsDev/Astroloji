import { getCreditBalance } from '@/services/credits';
import { STREAK_MILESTONE_REWARDS, type StreakMilestone } from '@/types';
import { getLocalDateIdentifier } from '@/utils/date';
import { updateStreak } from '@/utils/streak';

export interface StreakCheckInResult {
  streakCount: number;
  lastStreakDate: string;
  milestoneAchieved: number | null;
  creditsGranted: number;
  balance: number;
}

interface UserStreakRow {
  streak_count: number;
  last_streak_date: string | null;
  streak_milestone_claimed: number;
  utc_offset: number;
}

function isRewardedMilestone(milestone: number): milestone is StreakMilestone {
  return milestone in STREAK_MILESTONE_REWARDS;
}

/**
 * Server-authoritative streak check-in. The streak count and milestone reward are both
 * computed here (not trusted from the client) so credit rewards can't be farmed by
 * replaying a fabricated streak count.
 */
export async function checkInStreak(
  db: D1Database,
  userId: string,
  ledgerId: string,
  now: Date = new Date()
): Promise<StreakCheckInResult> {
  const user = await db
    .prepare('SELECT streak_count, last_streak_date, streak_milestone_claimed, utc_offset FROM users WHERE id = ?')
    .bind(userId)
    .first<UserStreakRow>();
  if (!user) {
    throw new Error('User not found.');
  }

  const today = getLocalDateIdentifier(user.utc_offset, now);
  const updated = updateStreak(user.last_streak_date, user.streak_count, today);

  await db
    .prepare('UPDATE users SET streak_count = ?, last_streak_date = ? WHERE id = ?')
    .bind(updated.streakCount, updated.lastStreakDate, userId)
    .run();

  let creditsGranted = 0;
  const milestone = updated.milestoneAchieved;
  if (milestone !== null && milestone > user.streak_milestone_claimed && isRewardedMilestone(milestone)) {
    const claim = await db
      .prepare('UPDATE users SET streak_milestone_claimed = ? WHERE id = ? AND streak_milestone_claimed < ?')
      .bind(milestone, userId, milestone)
      .run();
    if ((claim.meta.changes ?? 0) === 1) {
      creditsGranted = STREAK_MILESTONE_REWARDS[milestone];
      await db
        .prepare(
          `INSERT INTO credit_ledger (id, user_id, purchase_token, product_id, delta, reason, feature, created_at)
           VALUES (?, ?, NULL, NULL, ?, 'streak_reward', ?, ?)`
        )
        .bind(ledgerId, userId, creditsGranted, String(milestone), now.toISOString())
        .run();
    }
  }

  const balance = await getCreditBalance(db, userId);
  return {
    streakCount: updated.streakCount,
    lastStreakDate: updated.lastStreakDate,
    milestoneAchieved: milestone,
    creditsGranted,
    balance
  };
}
