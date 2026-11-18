CREATE TABLE ui_panels (
 user_id TEXT PRIMARY KEY, message_id INTEGER, kind TEXT,
 last_update_id INTEGER NOT NULL DEFAULT -1,
 lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ui_cleanup (
 message_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL,
 created_at TEXT NOT NULL, next_attempt INTEGER NOT NULL DEFAULT 0
);
