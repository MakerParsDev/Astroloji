ALTER TABLE users ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_streak_date TEXT;
ALTER TABLE users ADD COLUMN streak_milestone_claimed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE credit_ledger_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_token TEXT UNIQUE,
  product_id TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('purchase', 'spend', 'streak_reward')),
  feature TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO credit_ledger_new (id, user_id, purchase_token, product_id, delta, reason, feature, created_at)
  SELECT id, user_id, purchase_token, product_id, delta, reason, feature, created_at FROM credit_ledger;

DROP TABLE credit_ledger;
ALTER TABLE credit_ledger_new RENAME TO credit_ledger;

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
