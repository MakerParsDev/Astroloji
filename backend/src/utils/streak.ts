export interface StreakUpdateResult {
  streakCount: number;
  lastStreakDate: string;
  milestoneAchieved: number | null;
}

const STREAK_MILESTONES = [100, 60, 30, 14, 7, 3];
const MS_PER_DAY = 86_400_000;

export function resolveStreakMilestone(count: number): number | null {
  return STREAK_MILESTONES.find((milestone) => count >= milestone) ?? null;
}

/**
 * Mirrors the Android client's StreakTracker.update so the server-authoritative
 * streak (used for reward granting) never drifts from what the app displays.
 */
export function updateStreak(
  previousDate: string | null,
  previousCount: number,
  today: string
): StreakUpdateResult {
  let streakCount: number;
  if (!previousDate) {
    streakCount = 1;
  } else if (previousDate === today) {
    streakCount = previousCount;
  } else if (Math.round((Date.parse(today) - Date.parse(previousDate)) / MS_PER_DAY) === 1) {
    streakCount = previousCount + 1;
  } else {
    streakCount = 1;
  }

  return {
    streakCount,
    lastStreakDate: today,
    milestoneAchieved: resolveStreakMilestone(streakCount)
  };
}
