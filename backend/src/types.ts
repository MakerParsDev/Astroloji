import type { Context, MiddlewareHandler } from 'hono';

import type { GuidanceDomain } from '@/chart-engine/personalGuidance';

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

export const LANGUAGES = ['tr', 'en', 'es', 'pt'] as const;
export const PLATFORMS = ['android', 'ios'] as const;
export const NOTIFICATION_TARGET_TYPES = ['token', 'fid'] as const;
export const SUBSCRIPTION_PRODUCTS = ['premium_monthly', 'premium_weekly', 'premium_yearly'] as const;
/** One-time consumable products, verified via Play's INAPP purchase flow. Value = credits granted. */
export const CREDIT_PRODUCTS = {
  credits_small: 20,
  credits_medium: 60,
  credits_large: 150
} as const;
/** Credits granted the first time a user crosses each streak milestone. Keyed by milestone day count. */
export const STREAK_MILESTONE_REWARDS = {
  3: 5,
  7: 10,
  14: 15,
  30: 25,
  60: 40,
  100: 75
} as const;
export const MOOD_VALUES = ['great', 'good', 'neutral', 'low', 'stressed'] as const;
/** Exhaustiveness-checked against GuidanceDomain: a missing or extra key fails to compile. */
const MOOD_DOMAIN_SET: Record<GuidanceDomain, true> = {
  identity: true,
  emotions: true,
  communication: true,
  relationships: true,
  action: true,
  growth: true,
  responsibility: true,
  change: true,
  imagination: true,
  transformation: true
};
export const MOOD_DOMAINS = Object.keys(MOOD_DOMAIN_SET) as GuidanceDomain[];
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
  'sign_selected',
  'daily_viewed',
  'weekly_viewed',
  'monthly_viewed',
  'compat_checked',
  'personality_viewed',
  'share_clicked',
  'premium_screen_viewed',
  'premium_purchased',
  'premium_restored',
  'notification_tapped',
  'ad_shown',
  'streak_achieved',
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
  'daily_feedback_submitted',
  'content_view',
  'compat_check',
  'share',
  'notification_tap',
  'trial_started',
  'trial_converted',
  'trial_cancelled',
  'credit_purchased',
  'credit_spent',
  'friend_invited',
  'friend_accepted',
  'deep_reading_viewed',
  'mood_logged'
] as const;
export const CONTENT_TYPES = ['daily', 'weekly', 'monthly', 'compat', 'personality'] as const;
export const REWARD_TYPES = ['daily', 'weekly'] as const;
export const ADMIN_CAPABILITIES = ['content-ops', 'notification-ops', 'play-read', 'play-write'] as const;
export const ADMIN_OPERATIONS = [
  'content.backfill',
  'content.cache_bypass',
  'notification.send',
  'play.subscription_list',
  'play.subscription_update',
  'play.subscription_audit',
  'play.review_list',
  'play.review_reply'
] as const;

export type Sign = (typeof SIGNS)[number];
export type Language = (typeof LANGUAGES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];
export type SubscriptionProductId = (typeof SUBSCRIPTION_PRODUCTS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];
export type UserEventType = (typeof USER_EVENT_TYPES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type RewardType = (typeof REWARD_TYPES)[number];
export type CreditProductId = keyof typeof CREDIT_PRODUCTS;
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];
export type AdminOperation = (typeof ADMIN_OPERATIONS)[number];

interface SecretBindings {
  JWT_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  ADMIN_CONTENT_SECRET: string;
  ADMIN_NOTIFICATION_SECRET: string;
  ADMIN_PLAY_READ_SECRET: string;
  ADMIN_PLAY_WRITE_SECRET: string;
  ADMOB_REWARDED_ID: string;
  /** Base64-encoded 32-byte (AES-256) key. Generate with `openssl rand -base64 32`. See services/birthDataEncryption.ts. */
  BIRTH_DATA_ENCRYPTION_KEY: string;
}

interface RuntimeConfigBindings {
  PLAY_RTDN_AUDIENCE: string;
  PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: string;
}

export type Env = CloudflareEnv & SecretBindings & RuntimeConfigBindings;

export interface RewardEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  RATE_LIMITER: Env['RATE_LIMITER'];
  JWT_SECRET: string;
  ADMOB_REWARDED_ID: string;
}

export interface TransitionEnv extends RewardEnv {
  LEGACY_REWARD_FORWARD_UNTIL: string;
}

export interface AuthContext {
  userId: string;
  isPremium: boolean;
  exp: number;
  firebaseUid?: string;
}

export interface AppVariables {
  auth: AuthContext;
  requestId: string;
  bypassCache: boolean;
}

export interface BindingsFor<E> {
  Bindings: E;
  Variables: AppVariables;
}

export interface AppBindings extends BindingsFor<Env> {}
export interface RewardBindings<E extends RewardEnv = RewardEnv> extends BindingsFor<E> {}
export interface TransitionBindings extends RewardBindings<TransitionEnv> {}

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
  target_type: NotificationTargetType;
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

export type PlayRtdnMessageStatus = 'processing' | 'processed';
export type PlayRtdnOutcome =
  | 'test'
  | 'processed'
  | 'reconciliation_pending'
  | 'ignored_unknown_purchase';

export interface PlayRtdnMessageRow {
  message_id: string;
  package_name: string;
  message_fingerprint: string;
  notification_type: string | null;
  status: PlayRtdnMessageStatus;
  lease_token: string;
  lease_expires_at: string;
  received_at: string;
  processed_at: string | null;
  outcome: PlayRtdnOutcome | null;
}

export type RewardChallengeStatus = 'pending' | 'verified' | 'consumed';

export interface RewardChallengeRow {
  id: string;
  user_id: string;
  reward_type: RewardType;
  identifier: string;
  status: RewardChallengeStatus;
  transaction_id: string | null;
  ad_unit: string | null;
  callback_timestamp_ms: number | null;
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  consumed_at: string | null;
  entitlement_expires_at: string | null;
}

export type CreditLedgerReason = 'purchase' | 'spend' | 'streak_reward';
export type StreakMilestone = keyof typeof STREAK_MILESTONE_REWARDS;
export type MoodValue = (typeof MOOD_VALUES)[number];
export type MoodDomain = GuidanceDomain;

export interface CreditLedgerRow {
  id: string;
  user_id: string;
  purchase_token: string | null;
  product_id: string | null;
  delta: number;
  reason: CreditLedgerReason;
  feature: string | null;
  created_at: string;
}

export interface InviteCodeRow {
  code: string;
  owner_user_id: string;
  created_at: string;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
}

export interface FriendshipRow {
  id: string;
  user_a: string;
  user_b: string;
  status: 'active';
  created_at: string;
}

export interface AcceptInviteRequest {
  code: string;
}

export interface DeepReadingRequest {
  language: Language;
}

export interface ChatTurnRequest {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMessageRequest {
  language: Language;
  message: string;
  history: ChatTurnRequest[];
}

export interface StreakCheckInResponse {
  streak_count: number;
  last_streak_date: string;
  milestone_achieved: number | null;
  credits_granted: number;
  balance: number;
}

export interface MoodLogRequest {
  mood: MoodValue;
  domain?: MoodDomain;
}

export interface MoodLogResponse {
  date: string;
  mood: MoodValue;
  domain: MoodDomain | null;
}

export interface MoodInsightResponse {
  insight: {
    domain: MoodDomain;
    occurrences: number;
    correlated: number;
  } | null;
}

export interface ContentDocumentMetadata {
  content_version?: string;
  generated_at?: string;
  calculation_version?: string;
  editorial_status?: string;
  source_signals?: string[];
  approved_by?: string;
  approval_reference?: string;
  approved_at?: string;
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

export interface DailyContentDocument extends ContentDocumentMetadata {
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

export interface WeeklyContentDocument extends ContentDocumentMetadata {
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

export interface MonthlyContentDocument extends ContentDocumentMetadata {
  month: string;
  month_start: string;
  month_end: string;
  language: Language;
  signs: Record<Sign, MonthlySignContent>;
}

export interface CompatibilityContentDocument extends ContentDocumentMetadata {
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

export interface PersonalityContentDocument extends ContentDocumentMetadata {
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
  fcm_token?: string;
  firebase_installation_id?: string;
  notification_hour?: number;
  utc_offset: number;
  platform: Platform;
}

export interface UpdateUserRequest {
  sign?: Sign;
  language?: Language;
  fcm_token?: string;
  firebase_installation_id?: string;
  notification_enabled?: boolean;
  notification_hour?: number;
  utc_offset?: number;
  platform?: Platform;
}

export interface SubscriptionVerifyRequest {
  purchase_token: string;
  product_id: SubscriptionProductId;
}

export interface CreditsVerifyRequest {
  purchase_token: string;
  product_id: CreditProductId;
}

export interface CreditsSpendRequest {
  amount: number;
  feature: string;
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

export interface RewardPrepareRequest {
  reward_type: RewardType;
  identifier: string;
}

export interface RewardClaimRequest {
  challenge_id: string;
}

export type BirthTimeCertainty = 'exact' | 'approximate' | 'unknown';

export interface GeographicObserverInput {
  latitude: number;
  longitude: number;
}

export interface NatalChartRequest {
  timestamp: string;
  time_certainty: BirthTimeCertainty;
  /** Birth location — optional; without it, Ascendant/Midheaven/houses stay null. See ADR-0002. */
  observer?: GeographicObserverInput;
}

export interface TransitChartRequest {
  natal_timestamp: string;
  natal_time_certainty: BirthTimeCertainty;
  target_timestamp: string;
}

export interface PersonalGuidanceRequest extends TransitChartRequest {
  language: Language;
}

export interface UserBirthDataRow {
  user_id: string;
  time_certainty: BirthTimeCertainty;
  encrypted_payload: string;
  encryption_iv: string;
  encryption_key_version: number;
  created_at: string;
  updated_at: string;
}

export interface SaveBirthDataRequest {
  /** "YYYY-MM-DD" in the birth city's local calendar. Always required — the Sun sign needs at least the date. */
  local_date: string;
  /** "HH:mm:ss" in the birth city's local time. Required unless time_certainty is "unknown"; when absent, local noon is used as an explicit placeholder and time-sensitive results (Moon, Ascendant, houses) stay unavailable. */
  local_time?: string;
  time_certainty: BirthTimeCertainty;
  city_id: string;
}

export interface BirthDataResponse {
  time_certainty: BirthTimeCertainty;
  has_birth_data: boolean;
}

export interface ContentBackfillRequest {
  seed_date?: string;
  daily_days: number;
  skip_static_content: boolean;
  language?: Language;
  editorial_status: 'approved';
  approved_by: string;
  approval_reference: string;
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

/** Play Developer API `purchases.products` response. purchaseState: 0=purchased, 1=canceled, 2=pending. consumptionState: 0=yet to be consumed, 1=consumed. */
export interface GooglePlayProductPurchaseResponse {
  kind?: string;
  purchaseTimeMillis?: string;
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
}

export interface FcmBatchResult {
  success: number;
  failed: number;
  failedTokens: string[];
}

export interface NotificationTarget {
  type: NotificationTargetType;
  value: string;
}

export interface NotificationTargetRow {
  user_id: string;
  sign: Sign;
  language: Language;
  utc_offset: number;
  token: string;
  target_type: NotificationTargetType;
  notification_hour: number;
}

export interface CronNotificationJob {
  title: string;
  body: string;
  data: Record<string, string>;
}
