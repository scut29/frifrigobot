CREATE TABLE products (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 category TEXT NOT NULL DEFAULT '', original_date TEXT,
 after_days INTEGER NOT NULL CHECK(after_days BETWEEN 1 AND 365), opened_date TEXT,
 quantity TEXT NOT NULL DEFAULT '1 confezione', finished INTEGER NOT NULL DEFAULT 0 CHECK(finished IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 CHECK(original_date IS NULL OR length(original_date)=10),
 CHECK(opened_date IS NULL OR length(opened_date)=10)
);
CREATE INDEX products_active ON products(finished,original_date);
CREATE TABLE templates (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, after_days INTEGER NOT NULL, category TEXT NOT NULL DEFAULT '');
CREATE TABLE sessions (user_id TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL, prompt_id INTEGER, updated_at TEXT NOT NULL);
CREATE TABLE processed (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, owner TEXT NOT NULL, valid INTEGER NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), hour INTEGER NOT NULL DEFAULT 8 CHECK(hour BETWEEN 0 AND 23), day_before INTEGER NOT NULL DEFAULT 1, on_day INTEGER NOT NULL DEFAULT 1, summary INTEGER NOT NULL DEFAULT 1);
INSERT INTO settings(id) VALUES(1);
CREATE TABLE outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, message_id INTEGER, created_at TEXT NOT NULL, session_token TEXT, user_id TEXT);
CREATE INDEX outbox_pending ON outbox(status,lease_until);
CREATE TABLE undo (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, expected_version INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
ALTER TABLE products ADD COLUMN last_event TEXT;
