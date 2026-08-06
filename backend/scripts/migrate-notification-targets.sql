ALTER TABLE fcm_tokens
  ADD COLUMN target_type TEXT NOT NULL DEFAULT 'token'
  CHECK (target_type IN ('token', 'fid'));

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_platform_target
  ON fcm_tokens(user_id, platform, target_type, updated_at);
