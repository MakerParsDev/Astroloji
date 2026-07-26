import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { USER_EVENT_TYPES } from '@/types';

const ANDROID_ANALYTICS_SOURCE = resolve(
  process.cwd(),
  '../Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/AnalyticsRepository.kt'
);

function readAndroidAnalyticsEvents(): string[] {
  const source = readFileSync(ANDROID_ANALYTICS_SOURCE, 'utf8');
  return [...source.matchAll(/const val [A-Z0-9_]+ = "([a-z0-9_]+)"/g)].map(
    (match) => match[1]
  );
}

describe('analytics event contract', () => {
  it('accepts every event emitted by the Android client', () => {
    const mobileEvents = readAndroidAnalyticsEvents();

    expect(mobileEvents.length).toBeGreaterThan(0);
    expect(USER_EVENT_TYPES).toEqual(expect.arrayContaining(mobileEvents));
  });
});
