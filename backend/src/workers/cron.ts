import { createPersonalGuidance } from '@/chart-engine/personalGuidance';
import { sendBatchNotifications } from '@/services/fcm';
import { getSubscriptionStatus, hasPremiumEntitlement } from '@/services/playBilling';
import type {
  CronNotificationJob,
  DailyContentDocument,
  Env,
  NotificationTarget,
  NotificationTargetRow,
  SubscriptionRow
} from '@/types';
import { getCurrentUtcHour, getDateIdentifier, shouldSendNotificationAtUtcHour } from '@/utils/date';
import { getDecryptedBirthData } from '@/workers/birthData';
import { cleanupRewardChallenges } from '@/workers/reward';

/**
 * Minimum personal-guidance signal priority (0-100 scale, see personalGuidance.ts)
 * required before a transit push is sent instead of the generic daily one. Keeps
 * notification fatigue down by only interrupting the user for a genuinely tight,
 * weighty transit rather than every minor aspect of the day.
 */
const TRANSIT_NOTIFICATION_PRIORITY_THRESHOLD = 65;

const SIGN_LABELS = {
  tr: {
    aries: 'Koç',
    taurus: 'Boğa',
    gemini: 'İkizler',
    cancer: 'Yengeç',
    leo: 'Aslan',
    virgo: 'Başak',
    libra: 'Terazi',
    scorpio: 'Akrep',
    sagittarius: 'Yay',
    capricorn: 'Oğlak',
    aquarius: 'Kova',
    pisces: 'Balık'
  },
  en: {
    aries: 'Aries',
    taurus: 'Taurus',
    gemini: 'Gemini',
    cancer: 'Cancer',
    leo: 'Leo',
    virgo: 'Virgo',
    libra: 'Libra',
    scorpio: 'Scorpio',
    sagittarius: 'Sagittarius',
    capricorn: 'Capricorn',
    aquarius: 'Aquarius',
    pisces: 'Pisces'
  },
  es: {
    aries: 'Aries',
    taurus: 'Tauro',
    gemini: 'Géminis',
    cancer: 'Cáncer',
    leo: 'Leo',
    virgo: 'Virgo',
    libra: 'Libra',
    scorpio: 'Escorpio',
    sagittarius: 'Sagitario',
    capricorn: 'Capricornio',
    aquarius: 'Acuario',
    pisces: 'Piscis'
  }
} as const;

const NOTIFICATION_TITLE_FORMAT: Record<keyof typeof SIGN_LABELS, (signLabel: string) => string> = {
  tr: (signLabel) => `${signLabel} Burcu Bugün`,
  en: (signLabel) => `${signLabel} Horoscope Today`,
  es: (signLabel) => `Horóscopo de ${signLabel} Hoy`
};

export function buildDailyNotificationTitle(sign: keyof typeof SIGN_LABELS.tr, language: keyof typeof SIGN_LABELS) {
  return NOTIFICATION_TITLE_FORMAT[language](SIGN_LABELS[language][sign]);
}

async function expireAndRefreshSubscriptions(env: Env) {
  const now = new Date().toISOString();
  const expiring = await env.DB.prepare(
    `SELECT * FROM subscriptions WHERE status IN ('active', 'cancelled', 'grace_period') AND expires_at < ?`
  )
    .bind(now)
    .all<SubscriptionRow>();

  for (const subscription of expiring.results ?? []) {
    const current = await getSubscriptionStatus(
      env,
      subscription.purchase_token,
      subscription.product_id,
      env.PACKAGE_NAME
    );

    if (!current) {
      await env.DB
        .prepare(
          `INSERT INTO subscription_events (id, user_id, purchase_token, event_type, payload, created_at)
           VALUES (?, ?, ?, 'sync_pending', ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          subscription.user_id,
          subscription.purchase_token,
          JSON.stringify({ source: 'cron', reconciliation: 'pending' }),
          now
        )
        .run();
      continue;
    }

    if (hasPremiumEntitlement(current, now)) {
      await env.DB
        .prepare(
          `UPDATE subscriptions
           SET expires_at = ?, status = ?, auto_renewing = ?, cancel_reason = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          current.expiresAt,
          current.status,
          Number(current.autoRenewing),
          current.cancelReason,
          now,
          subscription.id
        )
        .run();
      await env.DB
        .prepare('UPDATE users SET is_premium = 1, premium_expires_at = ? WHERE id = ?')
        .bind(current.expiresAt, subscription.user_id)
        .run();
      await env.DB
        .prepare('UPDATE users SET subscription_state = ?, last_seen_at = ? WHERE id = ?')
        .bind(current.status, now, subscription.user_id)
        .run();
      continue;
    }

    await env.DB
      .prepare(`UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ?`)
      .bind(now, subscription.id)
      .run();
    await env.DB
      .prepare('UPDATE users SET is_premium = 0, subscription_state = ?, premium_expires_at = ?, last_seen_at = ? WHERE id = ?')
      .bind('expired', subscription.expires_at, now, subscription.user_id)
      .run();
    await env.DB
      .prepare(
        `INSERT INTO subscription_events (id, user_id, purchase_token, event_type, payload, created_at)
         VALUES (?, ?, ?, 'expired', ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        subscription.user_id,
        subscription.purchase_token,
        JSON.stringify({ source: 'cron' }),
        now
      )
      .run();
  }
}

async function buildNotificationJob(
  env: Env,
  target: NotificationTargetRow
): Promise<CronNotificationJob | null> {
  const date = getDateIdentifier();
  const object = await env.CONTENT.get(`content/daily/${target.language}/${date}.json`);
  if (!object) {
    return null;
  }

  const document = (await object.json()) as DailyContentDocument;
  const entry = document.signs[target.sign];
  const title = buildDailyNotificationTitle(target.sign, target.language);

  return {
    title,
    body: entry.short,
    data: {
      type: 'daily',
      sign: target.sign,
      date
    }
  };
}

/**
 * Returns a personalized transit-based notification when the user has saved birth data and
 * today's strongest transit aspect clears the meaningfulness threshold, otherwise null so the
 * caller falls back to the generic daily notification. A missing/undecryptable birth-data row
 * or an ineligible (Moon-based, when birth time is uncertain) signal are both treated as "no
 * personalized signal available" rather than as errors.
 */
async function buildTransitNotificationJob(
  env: Env,
  target: NotificationTargetRow
): Promise<CronNotificationJob | null> {
  const birthData = await getDecryptedBirthData(env, target.user_id);
  if (!birthData) {
    return null;
  }

  const guidance = createPersonalGuidance({
    natalTimestamp: birthData.plaintext.timestamp,
    natalTimeCertainty: birthData.timeCertainty,
    targetTimestamp: new Date().toISOString(),
    language: target.language
  });

  const topSignal = guidance.signals[0];
  if (!topSignal || topSignal.priority < TRANSIT_NOTIFICATION_PRIORITY_THRESHOLD) {
    return null;
  }

  return {
    title: topSignal.title,
    body: topSignal.summary,
    data: {
      type: 'transit',
      signal_id: topSignal.id,
      domain: topSignal.domain,
      date: getDateIdentifier()
    }
  };
}

async function dispatchScheduledNotifications(env: Env, currentUtcHour: number) {
  const groupedJobs = new Map<string, NotificationTarget[]>();
  const PAGE_SIZE = 500;
  let offset = 0;

  while (true) {
    const targets = await env.DB.prepare(
      `SELECT u.id AS user_id, u.sign, u.language, u.utc_offset, f.token, f.target_type, f.notification_hour
       FROM users u
       INNER JOIN fcm_tokens f ON f.user_id = u.id
       WHERE f.notification_enabled = 1
       ORDER BY u.id ASC, f.id ASC
       LIMIT ? OFFSET ?`
    )
      .bind(PAGE_SIZE, offset)
      .all<NotificationTargetRow>();

    const rows = targets.results ?? [];
    if (rows.length === 0) {
      break;
    }

    for (const target of rows) {
      if (!shouldSendNotificationAtUtcHour(target.notification_hour, target.utc_offset, currentUtcHour)) {
        continue;
      }

      const job = (await buildTransitNotificationJob(env, target)) ?? (await buildNotificationJob(env, target));
      if (!job) {
        continue;
      }

      const key = JSON.stringify(job);
      const targetsForJob = groupedJobs.get(key) ?? [];
      targetsForJob.push({ type: target.target_type, value: target.token });
      groupedJobs.set(key, targetsForJob);
    }

    offset += PAGE_SIZE;
    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  for (const [serializedJob, targets] of groupedJobs.entries()) {
    const job = JSON.parse(serializedJob) as CronNotificationJob;
    await sendBatchNotifications(env, targets, job.title, job.body, job.data);
  }
}

export async function handleCron(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
) {
  void controller;
  await expireAndRefreshSubscriptions(env);
  await dispatchScheduledNotifications(env, getCurrentUtcHour());
  try {
    await cleanupRewardChallenges(env.DB);
  } catch (error) {
    console.error('Reward challenge cleanup failed.', {
      error: error instanceof Error ? error.message : 'unknown cleanup error'
    });
  }
}
