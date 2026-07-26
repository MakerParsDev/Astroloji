
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

CREATE INDEX IF NOT EXISTS idx_reward_challenges_user_entitlement
  ON reward_challenges(user_id, reward_type, identifier, status, entitlement_expires_at);
CREATE INDEX IF NOT EXISTS idx_reward_challenges_expires_at
  ON reward_challenges(expires_at);
