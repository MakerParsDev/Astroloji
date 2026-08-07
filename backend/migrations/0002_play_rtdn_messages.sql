CREATE TABLE IF NOT EXISTS play_rtdn_messages (
  message_id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  message_fingerprint TEXT NOT NULL,
  notification_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed')),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  outcome TEXT
);

CREATE INDEX IF NOT EXISTS idx_play_rtdn_messages_received_at
  ON play_rtdn_messages(received_at);