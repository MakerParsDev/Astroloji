-- Durable account-deletion intent. No user FK: it must survive a failed
-- or partially completed account deletion until the scheduled retry succeeds.
CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  user_id TEXT PRIMARY KEY NOT NULL,
  firebase_uid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  next_attempt_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_jobs_next_attempt
  ON account_deletion_jobs(next_attempt_at, created_at);
