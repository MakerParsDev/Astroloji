import { z } from 'zod';

import { MAX_CHAT_HISTORY_TURNS } from '@/llm/chatConsultationGenerator';

import {
  CREDIT_PRODUCTS,
  MOOD_DOMAINS,
  MOOD_VALUES,
  type AcceptInviteRequest,
  type ChatMessageRequest,
  type ContentBackfillRequest,
  type DeepReadingRequest,
  LANGUAGES,
  type MoodDomain,
  type MoodLogRequest,
  NOTIFICATION_TARGET_TYPES,
  PLATFORMS,
  REWARD_TYPES,
  SIGNS,
  SUBSCRIPTION_PRODUCTS,
  USER_EVENT_TYPES,
  type CreditsSpendRequest,
  type CreditsVerifyRequest,
  type Language,
  type NatalChartRequest,
  type NotificationRequest,
  type PersonalGuidanceRequest,
  type RewardClaimRequest,
  type RewardPrepareRequest,
  type RewardType,
  type RegisterRequest,
  type SaveBirthDataRequest,
  type Sign,
  type SubscriptionVerifyRequest,
  type TrackEventRequest,
  type TransitChartRequest,
  type UpdateUserRequest
} from '@/types';

const signSchema = z.enum(SIGNS);
const languageSchema = z.enum(LANGUAGES);
const platformSchema = z.enum(PLATFORMS);
const rewardTypeSchema = z.enum(REWARD_TYPES);
const productSchema = z.enum(SUBSCRIPTION_PRODUCTS);
const eventTypeSchema = z.enum(USER_EVENT_TYPES);
const notificationHourSchema = z.number().int().min(0).max(23);
const utcOffsetSchema = z.number().int().min(-12).max(14);

function requireSingleNotificationTarget(
  value: { fcm_token?: string; firebase_installation_id?: string },
  context: z.RefinementCtx
) {
  if (value.fcm_token && value.firebase_installation_id) {
    context.addIssue({
      code: 'custom',
      message: 'Provide either fcm_token or firebase_installation_id, not both.'
    });
  }
}

export const registerSchema = z
  .object({
    sign: signSchema,
    language: languageSchema.default('tr'),
    fcm_token: z.string().min(1).optional(),
    firebase_installation_id: z.string().min(1).optional(),
    notification_hour: notificationHourSchema.optional().default(9),
    utc_offset: utcOffsetSchema,
    platform: platformSchema.default('android')
  })
  .superRefine(requireSingleNotificationTarget);

export const updateUserSchema = z
  .object({
    sign: signSchema.optional(),
    language: languageSchema.optional(),
    fcm_token: z.string().min(1).optional(),
    firebase_installation_id: z.string().min(1).optional(),
    notification_enabled: z.boolean().optional(),
    notification_hour: notificationHourSchema.optional(),
    utc_offset: utcOffsetSchema.optional(),
    platform: platformSchema.optional()
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.'
  )
  .superRefine(requireSingleNotificationTarget);

export const subscriptionVerifySchema = z.object({
  purchase_token: z.string().min(1),
  product_id: productSchema
});

const creditProductSchema = z.enum(
  Object.keys(CREDIT_PRODUCTS) as [keyof typeof CREDIT_PRODUCTS, ...Array<keyof typeof CREDIT_PRODUCTS>]
);

export const creditsVerifySchema = z.object({
  purchase_token: z.string().min(1),
  product_id: creditProductSchema
});

export const creditsSpendSchema = z.object({
  amount: z.number().int().min(1).max(1000),
  feature: z.string().min(1).max(64)
});

export const trackEventSchema = z.object({
  event_type: eventTypeSchema,
  meta: z.record(z.string(), z.unknown()).optional().default({})
});

const dailyRewardIdentifierSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weeklyRewardIdentifierSchema = z.string().regex(/^\d{4}-W\d{2}$/);

export function isValidRewardIdentifier(rewardType: RewardType, identifier: string): boolean {
  const schema = rewardType === 'daily' ? dailyRewardIdentifierSchema : weeklyRewardIdentifierSchema;
  return schema.safeParse(identifier).success;
}

export const rewardPrepareSchema = z
  .object({
    reward_type: rewardTypeSchema,
    identifier: z.string().min(1)
  })
  .superRefine((value, context) => {
    if (!isValidRewardIdentifier(value.reward_type, value.identifier)) {
      context.addIssue({
        code: 'custom',
        path: ['identifier'],
        message: `identifier is invalid for ${value.reward_type} rewards.`
      });
    }
  });

export const rewardClaimSchema = z.object({
  challenge_id: z.uuid()
});

export const acceptInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/, 'code must be an 8-character invite code.')
});

export const deepReadingSchema = z.object({
  language: languageSchema.default('tr')
});

const chatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000)
});

export const chatMessageSchema = z.object({
  language: languageSchema.default('tr'),
  message: z.string().min(1).max(2000),
  history: z.array(chatTurnSchema).max(MAX_CHAT_HISTORY_TURNS * 2).default([])
});

const moodSchema = z.enum(MOOD_VALUES);
const moodDomainSchema = z.enum(MOOD_DOMAINS as [MoodDomain, ...MoodDomain[]]);

export const moodLogSchema = z.object({
  mood: moodSchema,
  domain: moodDomainSchema.optional()
});

const optionalSeedDateSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'seed_date must be in YYYY-MM-DD format.')
    .optional()
);

const optionalBooleanSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return parseBooleanFlag(value);
  }

  return value;
}, z.boolean().optional());

const UTC_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function isRealUtcTimestamp(value: string): boolean {
  const match = UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, '0'));
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, millisecond);

  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day &&
    instant.getUTCHours() === hour &&
    instant.getUTCMinutes() === minute &&
    instant.getUTCSeconds() === second &&
    instant.getUTCMilliseconds() === millisecond
  );
}

const utcTimestampSchema = z
  .string()
  .regex(UTC_TIMESTAMP_PATTERN, 'timestamp must be an ISO 8601 UTC timestamp.')
  .refine(isRealUtcTimestamp, 'timestamp must be a real ISO 8601 UTC instant.');

const birthTimeCertaintySchema = z.enum(['exact', 'approximate', 'unknown']);

const geographicObserverSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

export const natalChartSchema = z.object({
  timestamp: utcTimestampSchema,
  time_certainty: birthTimeCertaintySchema,
  observer: geographicObserverSchema.optional()
});

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'local_date must be in YYYY-MM-DD form.');
const localTimeSchema = z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'local_time must be in HH:mm:ss form.');

export const saveBirthDataSchema = z
  .object({
    local_date: localDateSchema,
    local_time: localTimeSchema.optional(),
    time_certainty: birthTimeCertaintySchema,
    city_id: z.string().min(1)
  })
  .superRefine((value, context) => {
    if (value.time_certainty !== 'unknown' && !value.local_time) {
      context.addIssue({
        code: 'custom',
        message: 'local_time is required unless time_certainty is "unknown".'
      });
    }
  });

export const transitChartSchema = z.object({
  natal_timestamp: utcTimestampSchema,
  natal_time_certainty: birthTimeCertaintySchema,
  target_timestamp: utcTimestampSchema
});

export const personalGuidanceSchema = transitChartSchema.extend({
  language: languageSchema
});

const approvalIdentifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(96)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Approval identifiers must be opaque and URL-safe.');

export const contentBackfillSchema = z.object({
  seed_date: optionalSeedDateSchema,
  daily_days: z.coerce.number().int().min(1).max(31).optional().default(14),
  skip_static_content: optionalBooleanSchema.default(true),
  language: languageSchema.optional(),
  editorial_status: z.literal('approved'),
  approved_by: approvalIdentifierSchema,
  approval_reference: approvalIdentifierSchema
});

export const notificationSchema = z.object({
  user_id: z.string().uuid().optional(),
  sign: signSchema.optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({})
});

export function validateSign(value: string): Sign {
  return signSchema.parse(value);
}

export function validateLanguage(value: string): Language {
  return languageSchema.parse(value);
}

export function validateRegisterBody(payload: unknown): RegisterRequest {
  return registerSchema.parse(payload);
}

export function validateUpdateUserBody(payload: unknown): UpdateUserRequest {
  return updateUserSchema.parse(payload);
}

export function validateSubscriptionBody(payload: unknown): SubscriptionVerifyRequest {
  return subscriptionVerifySchema.parse(payload);
}

export function validateCreditsVerifyBody(payload: unknown): CreditsVerifyRequest {
  return creditsVerifySchema.parse(payload);
}

export function validateCreditsSpendBody(payload: unknown): CreditsSpendRequest {
  return creditsSpendSchema.parse(payload);
}

export function validateAcceptInviteBody(payload: unknown): AcceptInviteRequest {
  return acceptInviteSchema.parse(payload);
}

export function validateDeepReadingBody(payload: unknown): DeepReadingRequest {
  return deepReadingSchema.parse(payload);
}

export function validateChatMessageBody(payload: unknown): ChatMessageRequest {
  return chatMessageSchema.parse(payload);
}

export function validateMoodLogBody(payload: unknown): MoodLogRequest {
  return moodLogSchema.parse(payload);
}

export function validateTrackEventBody(payload: unknown): TrackEventRequest {
  return trackEventSchema.parse(payload);
}

export function validateRewardPrepareBody(payload: unknown): RewardPrepareRequest {
  return rewardPrepareSchema.parse(payload);
}

export function validateRewardClaimBody(payload: unknown): RewardClaimRequest {
  return rewardClaimSchema.parse(payload);
}

export function validateNatalChartBody(payload: unknown): NatalChartRequest {
  return natalChartSchema.parse(payload);
}

export function validateSaveBirthDataBody(payload: unknown): SaveBirthDataRequest {
  return saveBirthDataSchema.parse(payload);
}

export function validateTransitChartBody(payload: unknown): TransitChartRequest {
  return transitChartSchema.parse(payload);
}

export function validatePersonalGuidanceBody(payload: unknown): PersonalGuidanceRequest {
  return personalGuidanceSchema.parse(payload);
}

export function validateContentBackfillBody(payload: unknown): ContentBackfillRequest {
  return contentBackfillSchema.parse(payload);
}

export function validateNotificationBody(payload: unknown): NotificationRequest {
  return notificationSchema.parse(payload);
}

export function parseBooleanFlag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function normalizeCompatibilityPair(sign1: string, sign2: string) {
  const normalized = [validateSign(sign1), validateSign(sign2)].sort();
  return {
    normalizedSign1: normalized[0],
    normalizedSign2: normalized[1],
    key: `${normalized[0]}-${normalized[1]}`
  };
}

export function sanitizeNotificationData(data?: Record<string, unknown>): Record<string, string> {
  if (!data) {
    return {};
  }

  return Object.entries(data).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') {
      acc[key] = value;
    }
    return acc;
  }, {});
}
