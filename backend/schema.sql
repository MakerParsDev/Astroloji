PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE,
  sign TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'tr',
  utc_offset INTEGER NOT NULL DEFAULT 0 CHECK (utc_offset >= -12 AND utc_offset <= 14),
  is_premium INTEGER NOT NULL DEFAULT 0,
  subscription_state TEXT NOT NULL DEFAULT 'none',
  premium_expires_at TEXT,
  streak_count INTEGER NOT NULL DEFAULT 0,
  last_streak_date TEXT,
  streak_milestone_claimed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL DEFAULT 'token' CHECK (target_type IN ('token', 'fid')),
  platform TEXT NOT NULL DEFAULT 'android',
  notification_enabled INTEGER NOT NULL DEFAULT 1,
  notification_hour INTEGER NOT NULL DEFAULT 9 CHECK (notification_hour >= 0 AND notification_hour <= 23),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_platform_target
  ON fcm_tokens(user_id, platform, target_type, updated_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_token TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  auto_renewing INTEGER NOT NULL DEFAULT 1,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purchase_token TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS play_rtdn_messages (
  message_id TEXT PRIMARY KEY NOT NULL,
  package_name TEXT NOT NULL,
  message_fingerprint TEXT NOT NULL,
  notification_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed')),
  lease_token TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  outcome TEXT
);

CREATE INDEX IF NOT EXISTS idx_play_rtdn_messages_received_at
  ON play_rtdn_messages(received_at);

CREATE TABLE IF NOT EXISTS reward_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('daily', 'weekly')),
  identifier TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'consumed')),
  transaction_id TEXT UNIQUE,
  ad_unit TEXT,
  callback_timestamp_ms INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  consumed_at TEXT,
  entitlement_expires_at TEXT
);

CREATE TABLE IF NOT EXISTS user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_birth_data (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_certainty TEXT NOT NULL CHECK (time_certainty IN ('exact', 'approximate', 'unknown')),
  encrypted_payload TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_token TEXT UNIQUE,
  product_id TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('purchase', 'spend', 'streak_reward')),
  feature TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);

CREATE TABLE IF NOT EXISTS mood_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  mood TEXT NOT NULL CHECK (mood IN ('great', 'good', 'neutral', 'low', 'stressed')),
  domain TEXT CHECK (
    domain IN (
      'identity', 'emotions', 'communication', 'relationships', 'action',
      'growth', 'responsibility', 'change', 'imagination', 'transformation'
    )
  ),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_mood_logs_user_id ON mood_logs(user_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_owner_user_id ON invite_codes(owner_user_id);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active')),
  created_at TEXT NOT NULL,
  UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON friendships(user_a);
CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships(user_b);

CREATE INDEX IF NOT EXISTS idx_users_sign ON users(sign);
CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users(is_premium);
CREATE INDEX IF NOT EXISTS idx_users_subscription_state ON users(subscription_state);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_notification_hour ON fcm_tokens(notification_hour);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_purchase_token ON subscription_events(purchase_token);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events(created_at);

CREATE INDEX IF NOT EXISTS idx_reward_challenges_user_entitlement ON reward_challenges(user_id, reward_type, identifier, status, entitlement_expires_at);
CREATE INDEX IF NOT EXISTS idx_reward_challenges_expires_at ON reward_challenges(expires_at);
