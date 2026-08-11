import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDecryptedBirthDataMock, createPersonalGuidanceMock } = vi.hoisted(() => ({
  getDecryptedBirthDataMock: vi.fn(),
  createPersonalGuidanceMock: vi.fn()
}));

vi.mock('@/workers/birthData', () => ({
  getDecryptedBirthData: getDecryptedBirthDataMock
}));

vi.mock('@/chart-engine/personalGuidance', () => ({
  createPersonalGuidance: createPersonalGuidanceMock
}));

import { getMoodInsight, logMood } from '@/services/mood';
import type { Env } from '@/types';

interface MoodLogRow {
  user_id: string;
  date: string;
  mood: string;
  domain: string | null;
}

function createFakeDb(rows: MoodLogRow[] = [], utcOffset = 0) {
  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const statement = {
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
        async first() {
          if (normalized.startsWith('SELECT utc_offset FROM users')) {
            return { utc_offset: utcOffset };
          }
          return null;
        },
        async run() {
          if (normalized.startsWith('INSERT INTO mood_logs')) {
            const [, userId, date, mood, domain] = statement.bindings as [string, string, string, string, string | null];
            const existing = rows.find((row) => row.user_id === userId && row.date === date);
            if (existing) {
              existing.mood = mood;
              existing.domain = domain;
            } else {
              rows.push({ user_id: userId, date, mood, domain });
            }
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          if (normalized.startsWith('SELECT date, domain FROM mood_logs')) {
            const userId = statement.bindings[0] as string;
            const matches = rows
              .filter((row) => row.user_id === userId && ['low', 'stressed'].includes(row.mood) && row.domain)
              .sort((a, b) => (a.date < b.date ? 1 : -1));
            return { results: matches.map((row) => ({ date: row.date, domain: row.domain })) };
          }
          return { results: [] };
        }
      };
      return statement;
    }
  };
  return { db: db as unknown as D1Database, rows };
}

describe('logMood', () => {
  it('records a new mood log for today in the user local timezone', async () => {
    const { db, rows } = createFakeDb([], 0);

    const result = await logMood(db, 'user-1', 'stressed', 'communication', new Date('2026-08-11T12:00:00Z'));

    expect(result).toEqual({ date: '2026-08-11', mood: 'stressed', domain: 'communication' });
    expect(rows).toHaveLength(1);
  });

  it('overwrites an existing log for the same day', async () => {
    const { db, rows } = createFakeDb(
      [{ user_id: 'user-1', date: '2026-08-11', mood: 'great', domain: null }],
      0
    );

    await logMood(db, 'user-1', 'low', 'work' as never, new Date('2026-08-11T12:00:00Z'));

    expect(rows).toHaveLength(1);
    expect(rows[0].mood).toBe('low');
  });
});

describe('getMoodInsight', () => {
  const env = { DB: undefined } as unknown as Env;

  beforeEach(() => {
    getDecryptedBirthDataMock.mockReset();
    createPersonalGuidanceMock.mockReset();
  });

  it('returns null when there are fewer than 3 occurrences for any domain', async () => {
    const { db } = createFakeDb([
      { user_id: 'user-1', date: '2026-08-01', mood: 'stressed', domain: 'communication' },
      { user_id: 'user-1', date: '2026-08-02', mood: 'low', domain: 'communication' }
    ]);

    const insight = await getMoodInsight({ ...env, DB: db }, 'user-1');

    expect(insight).toBeNull();
    expect(getDecryptedBirthDataMock).not.toHaveBeenCalled();
  });

  it('returns null when the user has no birth data to correlate against', async () => {
    const { db } = createFakeDb([
      { user_id: 'user-1', date: '2026-08-01', mood: 'stressed', domain: 'communication' },
      { user_id: 'user-1', date: '2026-08-02', mood: 'low', domain: 'communication' },
      { user_id: 'user-1', date: '2026-08-03', mood: 'stressed', domain: 'communication' }
    ]);
    getDecryptedBirthDataMock.mockResolvedValue(null);

    const insight = await getMoodInsight({ ...env, DB: db }, 'user-1');

    expect(insight).toBeNull();
  });

  it('counts how many of the recurring-domain dates had a matching transit signal', async () => {
    const { db } = createFakeDb([
      { user_id: 'user-1', date: '2026-08-01', mood: 'stressed', domain: 'communication' },
      { user_id: 'user-1', date: '2026-08-02', mood: 'low', domain: 'communication' },
      { user_id: 'user-1', date: '2026-08-03', mood: 'stressed', domain: 'communication' }
    ]);
    getDecryptedBirthDataMock.mockResolvedValue({
      plaintext: { timestamp: '1995-05-01T00:00:00.000Z' },
      timeCertainty: 'exact'
    });
    createPersonalGuidanceMock.mockImplementation(({ targetTimestamp }: { targetTimestamp: string }) => ({
      signals: targetTimestamp.startsWith('2026-08-01') || targetTimestamp.startsWith('2026-08-03')
        ? [{ domain: 'communication' }]
        : [{ domain: 'emotions' }]
    }));

    const insight = await getMoodInsight({ ...env, DB: db }, 'user-1');

    expect(insight).toEqual({ domain: 'communication', occurrences: 3, correlated: 2 });
  });
});
