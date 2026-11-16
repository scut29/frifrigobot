ALTER TABLE products ADD COLUMN track_opening INTEGER NOT NULL DEFAULT 1 CHECK(track_opening IN (0,1));
ALTER TABLE templates ADD COLUMN track_opening INTEGER NOT NULL DEFAULT 1 CHECK(track_opening IN (0,1));
-- Correct the egg entry explicitly reported by the owner, leave other foods intact.
UPDATE products SET track_opening=0,after_days=1,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lower(trim(name))='uova' AND after_days=365 AND opened_date IS NULL AND finished=0;
UPDATE templates SET track_opening=0,after_days=1 WHERE name_key='uova' AND after_days=365;
