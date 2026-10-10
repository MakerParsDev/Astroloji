-- Durable account-deletion intent. No user FK: it must survive a failed
-- or partially completed account deletion until the scheduled retry succeeds.
CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  user_id TEXT PRIMARY KEY NOT NULL,
  firebase_uid TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_jobs_created_at
  ON account_deletion_jobs(created_at);
