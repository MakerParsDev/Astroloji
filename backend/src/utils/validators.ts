import { z } from 'zod';

import {
  type ContentBackfillRequest,
  LANGUAGES,
  PLATFORMS,
  REWARD_TYPES,
  SIGNS,
  SUBSCRIPTION_PRODUCTS,
  USER_EVENT_TYPES,
  type Language,
  type NatalChartRequest,
  type NotificationRequest,
  type RewardClaimRequest,
  type RewardPrepareRequest,
  type RewardType,
  type RegisterRequest,
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

export const registerSchema = z.object({
  sign: signSchema,
  language: languageSchema.default('tr'),
  fcm_token: z.string().min(1).optional(),
  notification_hour: notificationHourSchema.optional().default(9),
  utc_offset: utcOffsetSchema,
  platform: platformSchema.default('android')
});

export const updateUserSchema = z
  .object({
    sign: signSchema.optional(),
    language: languageSchema.optional(),
    fcm_token: z.string().min(1).optional(),
    notification_enabled: z.boolean().optional(),
    notification_hour: notificationHourSchema.optional(),
    utc_offset: utcOffsetSchema.optional(),
    platform: platformSchema.optional()
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.'
  );

export const subscriptionVerifySchema = z.object({
  purchase_token: z.string().min(1),
  product_id: productSchema
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

const utcTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'timestamp must be an ISO 8601 UTC timestamp.'
  );

const birthTimeCertaintySchema = z.enum(['exact', 'approximate', 'unknown']);

export const natalChartSchema = z.object({
  timestamp: utcTimestampSchema,
  time_certainty: birthTimeCertaintySchema
});

export const transitChartSchema = z.object({
  natal_timestamp: utcTimestampSchema,
  natal_time_certainty: birthTimeCertaintySchema,
  target_timestamp: utcTimestampSchema
});

export const contentBackfillSchema = z.object({
  seed_date: optionalSeedDateSchema,
  daily_days: z.coerce.number().int().min(1).max(31).optional().default(14),
  skip_static_content: optionalBooleanSchema.default(true)
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

export function validateTransitChartBody(payload: unknown): TransitChartRequest {
  return transitChartSchema.parse(payload);
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
