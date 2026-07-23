import type { Context, MiddlewareHandler } from 'hono';

export const SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
] as const;

export const LANGUAGES = ['tr', 'en'] as const;
export const PLATFORMS = ['android', 'ios'] as const;
export const SUBSCRIPTION_PRODUCTS = ['premium_monthly', 'premium_yearly'] as const;
export const SUBSCRIPTION_STATUSES = [
  'none',
  'active',
  'cancelled',
  'grace_period',
  'on_hold',
  'expired',
  'paused'
] as const;
export const SUBSCRIPTION_EVENT_TYPES = [
  'purchased',
  'renewed',
  'cancelled',
  'expired',
  'paused',
  'restarted',
  'sync_pending'
] as const;
export const USER_EVENT_TYPES = [
  'app_open',
  'content_view',
  'compat_check',
  'share',
  'notification_tap'
] as const;
export const CONTENT_TYPES = ['daily', 'weekly', 'monthly', 'compat', 'personality'] as const;
export const REWARD_TYPES = ['daily', 'weekly'] as const;

export type Sign = (typeof SIGNS)[number];
export type Language = (typeof LANGUAGES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type SubscriptionProductId = (typeof SUBSCRIPTION_PRODUCTS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];
export type UserEventType = (typeof USER_EVENT_TYPES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type RewardType = (typeof REWARD_TYPES)[number];

interface SecretBindings {
  JWT_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  PLAY_WEBHOOK_SECRET: string;
  ADMIN_SECRET: string;
}

export type Env = CloudflareEnv & SecretBindings;

export interface AuthContext {
  userId: string;
  isPremium: boolean;
  exp: number;
  firebaseUid?: string;
}

export interface AppVariables {
  auth: AuthContext;
  requestId: string;
  isAdmin: boolean;
  bypassCache: boolean;
}

export interface AppBindings {
  Bindings: Env;
  Variables: AppVariables;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type AppContext = Context<AppBindings>;
export type AppMiddleware = MiddlewareHandler<AppBindings>;

export interface JwtClaims {
  user_id: string;
  is_premium: boolean;
  firebase_uid?: string;
  jti?: string;
  exp: number;
  iat: number;
}

export interface FirebaseIdTokenClaims {
  aud: string;
  iss: string;
  sub: string;
  user_id?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}

export interface UserRow {
  id: string;
  firebase_uid: string | null;
  sign: Sign;
  language: Language;
  utc_offset: number;
  is_premium: number;
  subscription_state: SubscriptionStatus;
  premium_expires_at: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface FcmTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  notification_enabled: number;
  notification_hour: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  purchase_token: string;
  product_id: string;
  status: SubscriptionStatus;
  starts_at: string;
  expires_at: string;
  auto_renewing: number;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailySignContent {
  short: string;
  full: string;
  love: string;
  career: string;
  money: string;
  health: string;
  lucky_number: number;
  lucky_color: string;
  energy: number;
  love_score: number;
  career_score: number;
  money_score: number;
  health_score: number;
  daily_tip: string;
}

export interface DailyContentDocument {
  date: string;
  language: Language;
  signs: Record<Sign, DailySignContent>;
}

export interface WeeklySignContent {
  summary: string;
  love: string;
  career: string;
  money: string;
  best_day: string;
  warning: string;
}

export interface WeeklyContentDocument {
  week: string;
  week_start: string;
  week_end: string;
  language: Language;
  signs: Record<Sign, WeeklySignContent>;
}

export interface MonthlySignContent {
  summary: string;
  love: string;
  career: string;
  money: string;
  best_day: string;
  warning: string;
}

export interface MonthlyContentDocument {
  month: string;
  month_start: string;
  month_end: string;
  language: Language;
  signs: Record<Sign, MonthlySignContent>;
}

export interface CompatibilityContentDocument {
  sign1: Sign;
  sign2: Sign;
  language: Language;
  overall_score: number;
  love_score: number;
  friendship_score: number;
  work_score: number;
  summary: string;
  strengths: string[];
  challenges: string[];
  advice: string;
  famous_couples: string[];
}

export interface PersonalityContentDocument {
  sign: Sign;
  language: Language;
  title: string;
  summary: string;
  deep_analysis: string;
  strengths: string[];
  weaknesses: string[];
  ideal_partners: Sign[];
  career_fit: string[];
  element: string;
  planet: string;
  color: string;
  stone: string;
}

export interface RegisterRequest {
  sign: Sign;
  language: Language;
  fcm_token: string;
  notification_hour?: number;
  utc_offset: number;
  platform: Platform;
}

export interface UpdateUserRequest {
  sign?: Sign;
  language?: Language;
  fcm_token?: string;
  notification_enabled?: boolean;
  notification_hour?: number;
  utc_offset?: number;
  platform?: Platform;
}

export interface SubscriptionVerifyRequest {
  purchase_token: string;
  product_id: SubscriptionProductId;
}

export interface NotificationRequest {
  user_id?: string;
  sign?: Sign;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface TrackEventRequest {
  event_type: UserEventType;
  meta?: Record<string, unknown>;
}

export interface RewardClaimRequest {
  reward_type: RewardType;
  identifier: string;
}

export interface ContentBackfillRequest {
  seed_date?: string;
  daily_days: number;
  skip_static_content: boolean;
}

export interface RegisterResponse {
  user_id: string;
  jwt: string;
  is_premium: boolean;
  subscription_state: SubscriptionStatus;
  premium_expires_at: string | null;
}

export interface UserProfileResponse {
  user_id: string;
  sign: Sign;
  language: Language;
  utc_offset: number;
  is_premium: boolean;
  subscription_state: SubscriptionStatus;
  premium_expires_at: string | null;
  notification_enabled: boolean;
  notification_hour: number;
}

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id: string;
}

export interface GooglePlayLineItem {
  productId?: string;
  expiryTime?: string;
  autoRenewingPlan?: Record<string, unknown>;
  offerDetails?: Record<string, unknown>;
}

export interface GooglePlaySubscriptionResponse {
  kind?: string;
  subscriptionState?: string;
  acknowledgementState?: string;
  lineItems?: GooglePlayLineItem[];
  canceledStateContext?: {
    cancellationReason?: string;
    userInitiatedCancellation?: Record<string, unknown>;
  };
  linkedPurchaseToken?: string;
  latestOrderId?: string;
  startTime?: string;
}

export interface GooglePlaySubscription {
  purchaseToken: string;
  productId: string;
  status: SubscriptionStatus;
  startsAt: string;
  expiresAt: string;
  autoRenewing: boolean;
  cancelReason: string | null;
  raw: GooglePlaySubscriptionResponse;
}

export interface FcmBatchResult {
  success: number;
  failed: number;
  failedTokens: string[];
}

export interface NotificationTargetRow {
  user_id: string;
  sign: Sign;
  language: Language;
  utc_offset: number;
  token: string;
  notification_hour: number;
}

export interface CronNotificationJob {
  title: string;
  body: string;
  data: Record<string, string>;
}
