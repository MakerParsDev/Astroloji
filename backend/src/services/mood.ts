import { createPersonalGuidance } from '@/chart-engine/personalGuidance';
import { getDecryptedBirthData } from '@/workers/birthData';
import type { Env, MoodDomain, MoodValue } from '@/types';
import { getLocalDateIdentifier } from '@/utils/date';

const NEGATIVE_MOODS: readonly MoodValue[] = ['low', 'stressed'];
const MIN_OCCURRENCES_FOR_INSIGHT = 3;
const MAX_LOGS_CONSIDERED = 30;

export interface MoodLogResult {
  date: string;
  mood: MoodValue;
  domain: MoodDomain | null;
}

export async function logMood(
  db: D1Database,
  userId: string,
  mood: MoodValue,
  domain: MoodDomain | null,
  now: Date = new Date()
): Promise<MoodLogResult> {
  const user = await db.prepare('SELECT utc_offset FROM users WHERE id = ?').bind(userId).first<{
    utc_offset: number;
  }>();
  if (!user) {
    throw new Error('User not found.');
  }

  const date = getLocalDateIdentifier(user.utc_offset, now);
  await db
    .prepare(
      `INSERT INTO mood_logs (id, user_id, date, mood, domain, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, date) DO UPDATE SET mood = excluded.mood, domain = excluded.domain`
    )
    .bind(crypto.randomUUID(), userId, date, mood, domain, now.toISOString())
    .run();

  return { date, mood, domain };
}

interface MoodLogRow {
  date: string;
  domain: MoodDomain;
}

export interface MoodInsight {
  domain: MoodDomain;
  occurrences: number;
  correlated: number;
}

/**
 * Looks for a recurring negative-mood pattern tied to a life domain (e.g. "communication")
 * and checks how often a matching transit signal was actually active on those dates,
 * using the same guidance engine that powers personalized notifications.
 */
export async function getMoodInsight(env: Env, userId: string): Promise<MoodInsight | null> {
  const { results } = await env.DB.prepare(
    `SELECT date, domain FROM mood_logs
     WHERE user_id = ? AND mood IN ('low', 'stressed') AND domain IS NOT NULL
     ORDER BY date DESC LIMIT ?`
  )
    .bind(userId, MAX_LOGS_CONSIDERED)
    .all<MoodLogRow>();

  const countsByDomain = new Map<MoodDomain, string[]>();
  for (const row of results) {
    const dates = countsByDomain.get(row.domain) ?? [];
    dates.push(row.date);
    countsByDomain.set(row.domain, dates);
  }

  let topDomain: MoodDomain | null = null;
  let topDates: string[] = [];
  for (const [domain, dates] of countsByDomain.entries()) {
    if (dates.length >= MIN_OCCURRENCES_FOR_INSIGHT && dates.length > topDates.length) {
      topDomain = domain;
      topDates = dates;
    }
  }
  if (!topDomain) {
    return null;
  }

  const birthData = await getDecryptedBirthData(env, userId);
  if (!birthData) {
    return null;
  }

  let correlated = 0;
  for (const date of topDates) {
    const guidance = createPersonalGuidance({
      natalTimestamp: birthData.plaintext.timestamp,
      natalTimeCertainty: birthData.timeCertainty,
      targetTimestamp: `${date}T12:00:00.000Z`,
      language: 'en'
    });
    if (guidance.signals.some((signal) => signal.domain === topDomain)) {
      correlated += 1;
    }
  }

  return { domain: topDomain, occurrences: topDates.length, correlated };
}
