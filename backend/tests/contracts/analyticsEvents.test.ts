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

  it('supports the complete activation and monetization funnel taxonomy', () => {
    expect(USER_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'onboarding_started',
        'onboarding_step_viewed',
        'onboarding_completed',
        'notification_permission_result',
        'paywall_viewed',
        'paywall_plan_selected',
        'purchase_started',
        'purchase_succeeded',
        'purchase_failed',
        'purchase_cancelled',
        'rewarded_ad_started',
        'rewarded_ad_completed',
        'rewarded_ad_failed',
        'share_completed',
        'daily_feedback_submitted'
      ])
    );
  });
});
