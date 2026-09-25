CREATE TABLE IF NOT EXISTS oversized_mail_alert (
  session_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  notified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mail_monitor_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
