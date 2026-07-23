ALTER TABLE users ADD COLUMN subscription_state TEXT NOT NULL DEFAULT 'none';
CREATE INDEX IF NOT EXISTS idx_users_subscription_state ON users(subscription_state);
