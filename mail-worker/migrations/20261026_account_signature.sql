CREATE TABLE IF NOT EXISTS account_signature (
  account_id INTEGER PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
  html TEXT NOT NULL DEFAULT '',
  auto_new INTEGER NOT NULL DEFAULT 0 CHECK(auto_new IN (0, 1)),
  auto_reply_forward INTEGER NOT NULL DEFAULT 0 CHECK(auto_reply_forward IN (0, 1))
);
