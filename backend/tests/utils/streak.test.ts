import { describe, expect, it } from 'vitest';

import { resolveStreakMilestone, updateStreak } from '@/utils/streak';

describe('streak utils', () => {
  it('starts a new streak at 1 with no previous date', () => {
    expect(updateStreak(null, 0, '2026-08-11')).toEqual({
      streakCount: 1,
      lastStreakDate: '2026-08-11',
      milestoneAchieved: null
    });
  });

  it('keeps the same count when checking in again on the same day', () => {
    expect(updateStreak('2026-08-11', 5, '2026-08-11').streakCount).toBe(5);
  });

  it('increments the count on a consecutive day', () => {
    expect(updateStreak('2026-08-10', 5, '2026-08-11').streakCount).toBe(6);
  });

  it('resets to 1 after a gap of more than one day', () => {
    expect(updateStreak('2026-08-01', 20, '2026-08-11').streakCount).toBe(1);
  });

  it('reaches the 3-day milestone', () => {
    expect(updateStreak('2026-08-10', 2, '2026-08-11').milestoneAchieved).toBe(3);
  });

  it('resolves the highest milestone crossed', () => {
    expect(resolveStreakMilestone(1)).toBeNull();
    expect(resolveStreakMilestone(3)).toBe(3);
    expect(resolveStreakMilestone(10)).toBe(7);
    expect(resolveStreakMilestone(100)).toBe(100);
    expect(resolveStreakMilestone(250)).toBe(100);
  });
});
