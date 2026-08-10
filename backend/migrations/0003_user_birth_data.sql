CREATE TABLE IF NOT EXISTS user_birth_data (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_certainty TEXT NOT NULL CHECK (time_certainty IN ('exact', 'approximate', 'unknown')),
  encrypted_payload TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
